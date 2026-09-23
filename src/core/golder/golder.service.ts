import { randomUUID } from 'node:crypto';
import {
  type FilterQuery,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Client, type Message } from 'discord.js';

import { S3StorageService } from '#common/s3/s3-storage.service';
import { UserService } from '#core/users/users.service';
import { assertPublicHttpUrl, parseDiscordMessageUrl } from '#lib/utils';
import { type DiscordID } from '#root/lib/types';
import { CreateGolderUploadDto } from './dto/create-golder-upload.dto';
import {
  type GolderMediaDto,
  type GolderMediaListDto,
  type GolderUploadDto,
} from './dto/golder-media.dto';
import { ListGolderQueryDto } from './dto/list-golder-query.dto';
import { UpdateGolderMediaDto } from './dto/update-golder-media.dto';
import {
  GolderMediaEntity,
  GolderMediaStatus,
} from './entities/golder-media.entity';
import {
  GOLDER_CONTENT_TYPE_PATTERN,
  GOLDER_MAX_UPLOAD_BYTES,
  GOLDER_PRESIGN_EXPIRES_SECONDS,
  GOLDER_SLUG_MAX_LENGTH,
  GOLDER_TAG_SUGGESTION_LIMIT,
  normalizeTags,
} from './golder.constants';

@Injectable()
export class GolderService {
  constructor(
    @InjectRepository(GolderMediaEntity)
    private readonly mediaRepository: EntityRepository<GolderMediaEntity>,
    private readonly entityManager: EntityManager,
    private readonly storage: S3StorageService,
    private readonly userService: UserService,
    private readonly client: Client,
  ) {}

  async createUpload(
    user_id: DiscordID,
    dto: CreateGolderUploadDto,
  ): Promise<GolderUploadDto> {
    const existing = await this.mediaRepository.findOne({ slug: dto.slug });
    if (existing) {
      // Свою зависшую pending-запись (неудачная попытка загрузки) можно
      // перезаписать — она не должна навсегда занимать slug.
      if (
        existing.status !== GolderMediaStatus.Pending ||
        existing.uploaded_by !== BigInt(user_id)
      ) {
        throw new ConflictException('This slug is already taken.');
      }
      await this.storage
        .deleteObject(existing.object_key)
        .catch(() => undefined);
      await this.entityManager.remove(existing).flush();
    }

    const media = new GolderMediaEntity();
    media.slug = dto.slug;
    media.tags = dto.tags;
    media.uploaded_by = BigInt(user_id);
    media.object_key = buildObjectKey(dto.contentType);
    media.content_type = dto.contentType;
    media.size_bytes = BigInt(dto.sizeBytes);
    media.status = GolderMediaStatus.Pending;

    try {
      await this.entityManager.persist(media).flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictException('This slug is already taken.');
      }
      throw error;
    }

    const uploadUrl = await this.storage.getPresignedPutUrl(
      media.object_key,
      dto.contentType,
      GOLDER_PRESIGN_EXPIRES_SECONDS,
    );

    return {
      media: await this.toDto(media),
      upload: {
        url: uploadUrl,
        expiresInSeconds: GOLDER_PRESIGN_EXPIRES_SECONDS,
      },
    };
  }

  async completeUpload(
    user_id: DiscordID,
    id: string,
  ): Promise<GolderMediaDto> {
    const media = await this.mediaRepository.findOne(id);
    if (!media) {
      throw new NotFoundException('Golder media was not found.');
    }
    this.assertOwner(media, user_id);

    if (media.status !== GolderMediaStatus.Ready) {
      const head = await this.storage.headObject(media.object_key);
      if (!head) {
        throw new BadRequestException('The file has not been uploaded yet.');
      }
      media.status = GolderMediaStatus.Ready;
      await this.entityManager.persist(media).flush();
    }

    return this.toDto(media);
  }

  async updateMedia(
    user_id: DiscordID,
    slug: string,
    dto: UpdateGolderMediaDto,
  ): Promise<GolderMediaDto> {
    const media = await this.requireMedia(slug);
    this.assertOwner(media, user_id);

    if (dto.slug && dto.slug !== media.slug) {
      if (await this.mediaRepository.findOne({ slug: dto.slug })) {
        throw new ConflictException('This slug is already taken.');
      }
      media.slug = dto.slug;
    }
    if (dto.tags) {
      media.tags = dto.tags;
    }

    await this.entityManager.persist(media).flush();
    return this.toDto(media);
  }

  async deleteMedia(user_id: DiscordID, slug: string): Promise<void> {
    const media = await this.requireMedia(slug);
    this.assertOwner(media, user_id);

    await this.storage.deleteObject(media.object_key);
    await this.entityManager.remove(media).flush();
  }

  async listMedia(query: ListGolderQueryDto): Promise<GolderMediaListDto> {
    const where: FilterQuery<GolderMediaEntity> = {
      status: GolderMediaStatus.Ready,
    };
    if (query.search) {
      where.slug = { $ilike: `%${query.search}%` };
    }
    if (query.tagList.length > 0) {
      where.tags = { $overlap: query.tagList };
    }

    const [medias, total] = await this.mediaRepository.findAndCount(where, {
      limit: query.limit,
      offset: query.offset,
      orderBy: { createdAt: 'desc' },
    });

    return { items: await this.toDtos(medias), total };
  }

  async getMedia(slug: string): Promise<GolderMediaDto> {
    return this.toDto(await this.requireMedia(slug));
  }

  async suggestTags(prefix: string): Promise<string[]> {
    const rows = (await this.entityManager.execute(
      `select distinct t.tag
       from golder_media, jsonb_array_elements_text(tags) as t(tag)
       where status = 'ready' and t.tag ilike ?
       order by t.tag
       limit ?`,
      [`${prefix}%`, GOLDER_TAG_SUGGESTION_LIMIT],
    )) as { tag: string }[];
    return rows.map((row) => row.tag);
  }

  async importFromUrl(
    user_id: DiscordID,
    url: string,
    slug: string,
    tags: string[],
  ): Promise<GolderMediaDto[]> {
    const link = parseDiscordMessageUrl(url);
    if (link) {
      return this.importFromDiscordMessage(user_id, link, slug, tags);
    }
    return this.importFromDirectUrl(user_id, url, slug, tags);
  }

  async importFromDiscordMessage(
    user_id: DiscordID,
    message: { channelId: string; messageId: string },
    slug: string,
    tags: string[],
  ): Promise<GolderMediaDto[]> {
    if (await this.mediaRepository.findOne({ slug })) {
      throw new ConflictException('This slug is already taken.');
    }

    const discordMessage = await this.fetchDiscordMessage(message);
    const attachments = collectAttachments(discordMessage);
    if (attachments.length === 0) {
      throw new BadRequestException(
        'No supported attachments found in this message.',
      );
    }

    const created: GolderMediaDto[] = [];
    for (const [index, attachment] of attachments.entries()) {
      const downloaded = await downloadAttachment(attachment.url);
      if (!downloaded || downloaded.body.length > GOLDER_MAX_UPLOAD_BYTES) {
        continue;
      }
      const contentType =
        attachment.contentType ??
        downloaded.contentType ??
        contentTypeFromUrl(attachment.url);
      if (!contentType || !GOLDER_CONTENT_TYPE_PATTERN.test(contentType)) {
        continue;
      }
      created.push(
        await this.createImportedMedia(
          user_id,
          slug,
          tags,
          index,
          contentType,
          downloaded.body,
        ),
      );
    }

    if (created.length === 0) {
      throw new BadRequestException(
        'Failed to download attachments from this message.',
      );
    }
    return created;
  }

  async importFromDirectUrl(
    user_id: DiscordID,
    sourceUrl: string,
    slug: string,
    tags: string[],
  ): Promise<GolderMediaDto[]> {
    await assertPublicHttpUrl(sourceUrl);

    const response = await fetch(sourceUrl).catch(() => null);
    if (!response?.ok) {
      throw new BadRequestException(
        'Failed to download the file from the source URL.',
      );
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0].trim() ?? '';
    if (!GOLDER_CONTENT_TYPE_PATTERN.test(contentType)) {
      throw new BadRequestException(
        'The source URL does not point to a supported media file.',
      );
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > GOLDER_MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        'The file at the source URL is larger than 100 MB.',
      );
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length === 0 || body.length > GOLDER_MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        'The file at the source URL is larger than 100 MB.',
      );
    }

    return [
      await this.createImportedMedia(user_id, slug, tags, 0, contentType, body),
    ];
  }

  private async createImportedMedia(
    user_id: DiscordID,
    slug: string,
    tags: string[],
    index: number,
    contentType: string,
    body: Buffer,
  ): Promise<GolderMediaDto> {
    const media = new GolderMediaEntity();
    media.slug = await this.nextFreeSlug(slug, index);
    media.tags = normalizeTags(tags);
    media.uploaded_by = BigInt(user_id);
    media.object_key = buildObjectKey(contentType);
    media.content_type = contentType;
    media.size_bytes = BigInt(body.length);
    media.status = GolderMediaStatus.Ready;

    await this.storage.uploadObject(media.object_key, contentType, body);
    await this.entityManager.persist(media).flush();
    return this.toDto(media);
  }

  private async fetchDiscordMessage(message: {
    channelId: string;
    messageId: string;
  }) {
    const channel = await this.client.channels
      .fetch(message.channelId)
      .catch(() => null);
    if (!channel?.isTextBased()) {
      throw new NotFoundException(
        'Discord message was not found or is not accessible.',
      );
    }

    const discordMessage = await channel.messages
      .fetch(message.messageId)
      .catch(() => null);
    if (!discordMessage) {
      throw new NotFoundException(
        'Discord message was not found or is not accessible.',
      );
    }
    return discordMessage;
  }

  private async nextFreeSlug(base: string, index: number): Promise<string> {
    let slug =
      index === 0
        ? base
        : `${base}-${index + 1}`.slice(-GOLDER_SLUG_MAX_LENGTH);
    let counter = 2;
    while (await this.mediaRepository.findOne({ slug })) {
      const suffix = `-${counter++}`;
      slug = `${base.slice(0, GOLDER_SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
    }
    return slug;
  }

  private async requireMedia(slug: string): Promise<GolderMediaEntity> {
    const media = await this.mediaRepository.findOne({ slug });
    if (!media) {
      throw new NotFoundException('Golder media was not found.');
    }
    return media;
  }

  private assertOwner(media: GolderMediaEntity, userId: DiscordID): void {
    if (media.uploaded_by !== BigInt(userId)) {
      throw new ForbiddenException('Only the uploader can do this.');
    }
  }

  private async toDto(media: GolderMediaEntity): Promise<GolderMediaDto> {
    const author = await this.resolveAuthor(media.uploaded_by);
    return this.mapDto(media, author);
  }

  private mapDto(
    media: GolderMediaEntity,
    author: { username: string | null; avatarUrl: string | null },
  ): GolderMediaDto {
    return {
      id: media.id,
      slug: media.slug,
      tags: media.tags,
      url: this.storage.getPublicUrl(media.object_key),
      contentType: media.content_type,
      sizeBytes: media.size_bytes.toString(),
      status: media.status,
      uploadedBy: media.uploaded_by.toString(),
      uploadedByUsername: author.username,
      uploadedByAvatarUrl: author.avatarUrl,
      createdAt: media.createdAt.toISOString(),
      updatedAt: media.updatedAt.toISOString(),
    };
  }

  private async toDtos(medias: GolderMediaEntity[]): Promise<GolderMediaDto[]> {
    const authors = await Promise.all(
      medias.map((media) => this.resolveAuthor(media.uploaded_by)),
    );
    return medias.map((media, index) => this.mapDto(media, authors[index]));
  }

  private async resolveAuthor(
    userId: bigint,
  ): Promise<{ username: string | null; avatarUrl: string | null }> {
    const profile = await this.userService.getProfile(userId.toString());
    return {
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url || null,
    };
  }
}

function buildObjectKey(contentType: string): string {
  const rawExtension = contentType.split('/')[1] ?? '';
  const extension =
    rawExtension.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  return `golder/${randomUUID()}.${extension}`;
}

interface ImportableMedia {
  url: string;
  name: string;
  /** Known from the attachment; null for embed media — resolved after download. */
  contentType: string | null;
}

async function downloadAttachment(
  url: string,
): Promise<{ body: Buffer; contentType: string | null } | null> {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return null;
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType:
      response.headers.get('content-type')?.split(';')[0].trim() || null,
  };
}

function isKnownSupportedAttachment<T extends { contentType: string | null }>(
  attachment: T,
): boolean {
  return (
    attachment.contentType !== null &&
    GOLDER_CONTENT_TYPE_PATTERN.test(attachment.contentType)
  );
}

/** Own attachments, forwarded-message attachments and embed media, if any. */
function collectAttachments(discordMessage: Message): ImportableMedia[] {
  const snapshots = [...discordMessage.messageSnapshots.values()].flatMap(
    (snapshot) => [...snapshot.attachments.values()],
  );
  const embeds = [...discordMessage.embeds.values()].flatMap((embed) => {
    const urls = [
      embed.video?.url,
      embed.image?.url,
      embed.thumbnail?.url,
    ].filter((url): url is string => !!url);
    // embed.url обычно ведёт на страницу-источник; берём его, только если
    // это сам медиафайл и других кандидатов нет.
    if (urls.length === 0) {
      const fallback = embed.url;
      if (fallback && looksLikeMediaUrl(fallback)) {
        urls.push(fallback);
      }
    }
    return urls.map((url, index) => ({
      url,
      name: url.split('/').pop()?.split('?')[0] || `embed-${index}`,
      contentType: contentTypeFromUrl(url),
    }));
  });
  const all = [
    ...[...discordMessage.attachments.values()],
    ...snapshots,
    ...embeds,
  ];
  // For null content types keep only URLs that look like media by extension;
  // the final type is verified against the download response later.
  return all.filter(
    (item) =>
      isKnownSupportedAttachment(item) ||
      (item.contentType === null && looksLikeMediaUrl(item.url)),
  );
}

const MEDIA_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'ogg',
]);

function looksLikeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0];
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_EXTENSIONS.has(extension);
}

function contentTypeFromUrl(url: string): string | null {
  const path = url.split('?')[0];
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'ogg') return 'audio/ogg';
  return null;
}
