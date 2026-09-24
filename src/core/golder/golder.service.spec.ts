import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import {
  GolderMediaEntity,
  GolderMediaStatus,
} from './entities/golder-media.entity';
import { GolderService } from './golder.service';

const OWNER_ID = '357130048882343937';
const OTHER_ID = '123';

function createService(overrides?: {
  media?: GolderMediaEntity | null;
  discordMessage?: {
    attachments: {
      values: () => Array<{
        contentType: string | null;
        name: string;
        size: number;
        url: string;
      }>;
    };
  } | null;
}) {
  const mediaRepository = {
    findOne: mock(async (where: unknown) => {
      const current = overrides?.media;
      if (!current) return null;
      if (typeof where === 'string') {
        return where === current.id ? current : null;
      }
      return (where as { slug?: string }).slug === current.slug
        ? current
        : null;
    }),
    findAndCount: mock(async () => [[], 0]),
  };
  const entityManager = {
    persist: mock(() => ({ flush: async () => undefined })),
    remove: mock(() => ({ flush: async () => undefined })),
    execute: mock(async () => [{ tag: 'cat' }, { tag: 'art' }]),
  };
  const storage = {
    getPresignedPutUrl: mock(async () => 'https://signed.example/put'),
    getPublicUrl: mock((key: string) => `https://cdn.example/${key}`),
    headObject: mock(async () => ({ contentLength: 10 })),
    deleteObject: mock(async () => undefined),
    uploadObject: mock(async () => undefined),
  };
  const userService = {
    getProfile: mock(async () => ({ user_id: 1n, username: 'alice' })),
  };
  const discordMessage = overrides?.discordMessage ?? null;
  const client = {
    channels: {
      fetch: mock(async () =>
        discordMessage
          ? {
              isTextBased: () => true,
              messages: { fetch: mock(async () => discordMessage) },
            }
          : null,
      ),
    },
  };

  const service = new GolderService(
    mediaRepository as never,
    entityManager as never,
    storage as never,
    userService as never,
    client as never,
  );
  return {
    service,
    mediaRepository,
    entityManager,
    storage,
    userService,
    client,
  };
}

function createMedia(): GolderMediaEntity {
  const media = new GolderMediaEntity();
  media.id = '0198...uuid';
  media.slug = 'cat-picture';
  media.tags = ['cat'];
  media.uploaded_by = BigInt(OWNER_ID);
  media.object_key = 'golder/uuid.png';
  media.content_type = 'image/png';
  media.size_bytes = 10n;
  media.status = GolderMediaStatus.Pending;
  return media;
}

let media: GolderMediaEntity;

beforeEach(() => {
  media = createMedia();
});

describe('GolderService', () => {
  it('creates a pending upload and returns a presigned url', async () => {
    const { service, storage } = createService();

    const result = await service.createUpload(OWNER_ID, {
      name: 'Котик',
      tags: ['Cat', ' cat ', 'art'],
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    expect(result.upload.url).toBe('https://signed.example/put');
    expect(result.media.status).toBe(GolderMediaStatus.Pending);
    expect(result.media.slug).toBe('kotik');
    expect(result.media.name).toBe('Котик');
    expect(storage.getPresignedPutUrl).toHaveBeenCalledTimes(1);
  });

  it('suffixes the slug when the name is already published', async () => {
    media.status = GolderMediaStatus.Ready;
    const { service } = createService({ media });

    const result = await service.createUpload(OWNER_ID, {
      name: 'cat-picture',
      tags: [],
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    expect(result.media.slug).toBe('cat-picture-2');
  });

  it('lets the owner retry by replacing their own pending row', async () => {
    const { service, entityManager, storage } = createService({ media });

    const result = await service.createUpload(OWNER_ID, {
      name: 'Cat picture',
      tags: [],
      contentType: 'image/png',
      sizeBytes: 1024,
    });

    expect(entityManager.remove).toHaveBeenCalledWith(media);
    expect(storage.deleteObject).toHaveBeenCalledWith('golder/uuid.png');
    expect(result.media.slug).toBe('cat-picture');
    expect(result.media.name).toBe('Cat picture');
  });

  it('forbids completing uploads of other users', async () => {
    const { service } = createService({ media });

    await expect(service.completeUpload(OTHER_ID, media.id)).rejects.toThrow(
      'Only the uploader can do this.',
    );
  });

  it('rejects completion while the file is missing from storage', async () => {
    const { service, storage } = createService({ media });
    storage.headObject = mock(
      async () => null,
    ) as unknown as typeof storage.headObject;

    await expect(service.completeUpload(OWNER_ID, media.id)).rejects.toThrow(
      'The file has not been uploaded yet.',
    );
  });

  it('marks the upload as ready', async () => {
    const { service } = createService({ media });

    const result = await service.completeUpload(OWNER_ID, media.id);

    expect(result.status).toBe(GolderMediaStatus.Ready);
  });

  it('forbids updating media of other users', async () => {
    const { service } = createService({ media });

    await expect(
      service.updateMedia(OTHER_ID, media.slug, { tags: ['new'] }),
    ).rejects.toThrow('Only the uploader can do this.');
  });

  it('updates slug and tags for the owner', async () => {
    const { service } = createService({ media });

    const result = await service.updateMedia(OWNER_ID, media.slug, {
      name: 'Новое название',
      tags: ['dog'],
    });

    expect(result.name).toBe('Новое название');
    expect(result.slug).toBe('cat-picture');
    expect(result.tags).toEqual(['dog']);
  });

  it('deletes the object and the row for the owner', async () => {
    const { service, storage, entityManager } = createService({ media });

    await service.deleteMedia(OWNER_ID, media.slug);

    expect(storage.deleteObject).toHaveBeenCalledWith('golder/uuid.png');
    expect(entityManager.remove).toHaveBeenCalledWith(media);
  });

  it('returns public urls with uploader names', async () => {
    media.status = GolderMediaStatus.Ready;
    const { service } = createService({ media });

    const result = await service.getMedia(media.slug);

    expect(result.url).toBe('https://cdn.example/golder/uuid.png');
    expect(result.uploadedByUsername).toBe('alice');
  });

  it('maps tag suggestion rows to strings', async () => {
    const { service } = createService();

    const tags = await service.suggestTags('ca');

    expect(tags).toEqual(['cat', 'art']);
  });
});

describe('GolderService.importFromDiscordMessage', () => {
  const originalFetch = globalThis.fetch;

  function createDiscordMessage(
    attachments: Array<{
      contentType: string | null;
      name: string;
      size: number;
      url: string;
    }>,
    snapshots?: Array<{
      attachments: {
        values: () => Array<{
          contentType: string | null;
          name: string;
          size: number;
          url: string;
        }>;
      };
    }>,
    embeds?: Array<{ url?: string; video?: { url: string } }>,
  ) {
    return {
      attachments: { values: () => attachments },
      messageSnapshots: { values: () => snapshots ?? [] },
      embeds: { values: () => embeds ?? [] },
    };
  }

  function mockDownload(
    body: Uint8Array,
    headers: Record<string, string> = {},
  ) {
    globalThis.fetch = mock(
      async () =>
        new Response(body as unknown as BodyInit, {
          headers,
        }) as unknown as Response,
    ) as unknown as typeof fetch;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('imports attachments with the provided slug and normalized tags', async () => {
    mockDownload(new Uint8Array([1, 2, 3]));
    const { service, storage } = createService({
      discordMessage: createDiscordMessage([
        {
          contentType: 'image/png',
          name: 'Cat Picture.PNG',
          size: 3,
          url: 'https://cdn.discord.example/a.png',
        },
      ]),
    });

    const items = await service.importFromDiscordMessage(
      OWNER_ID,
      { channelId: '1', messageId: '2' },
      'Мой кот',
      ['Cat', ' MEME '],
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.slug).toBe('moy-kot');
    expect(items[0]?.name).toBe('Мой кот');
    expect(items[0]?.tags).toEqual(['cat', 'meme']);
    expect(items[0]?.status).toBe(GolderMediaStatus.Ready);
    expect(items[0]?.uploadedBy).toBe(OWNER_ID);
    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
  });

  it('suffixes slugs for multiple attachments', async () => {
    mockDownload(new Uint8Array([1]));
    const { service } = createService({
      discordMessage: createDiscordMessage([
        {
          contentType: 'image/png',
          name: 'a.png',
          size: 1,
          url: 'https://cdn.discord.example/a.png',
        },
        {
          contentType: 'image/png',
          name: 'b.png',
          size: 1,
          url: 'https://cdn.discord.example/b.png',
        },
      ]),
    });

    const items = await service.importFromDiscordMessage(
      OWNER_ID,
      { channelId: '1', messageId: '2' },
      'pic',
      [],
    );

    expect(items.map((item) => item.slug)).toEqual(['pic', 'pic-2']);
  });

  it('imports attachments from forwarded message snapshots', async () => {
    mockDownload(new Uint8Array([1]));
    const { service, storage } = createService({
      discordMessage: createDiscordMessage(
        [],
        [
          {
            attachments: {
              values: () => [
                {
                  contentType: 'video/mp4',
                  name: 'clip.mp4',
                  size: 1,
                  url: 'https://cdn.discord.example/clip.mp4',
                },
              ],
            },
          },
        ],
      ),
    });

    const items = await service.importFromDiscordMessage(
      OWNER_ID,
      { channelId: '1', messageId: '2' },
      'forwarded-clip',
      [],
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.contentType).toBe('video/mp4');
    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
  });

  it('imports media from a direct source url', async () => {
    mockDownload(new Uint8Array([9, 9, 9]), { 'content-type': 'video/mp4' });
    const { service, storage } = createService();

    const items = await service.importFromUrl(
      OWNER_ID,
      'http://93.184.216.34/media/generated_video.mp4',
      'direct-video',
      ['clip'],
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.slug).toBe('direct-video');
    expect(items[0]?.contentType).toBe('video/mp4');
    expect(storage.uploadObject).toHaveBeenCalledTimes(1);
  });

  it('rejects direct urls pointing to private hosts', async () => {
    const { service } = createService();

    await expect(
      service.importFromUrl(
        OWNER_ID,
        'http://127.0.0.1/file.png',
        'private',
        [],
      ),
    ).rejects.toThrow('Source URL host is not allowed.');
  });

  it('rejects direct urls that are not media files', async () => {
    mockDownload(new Uint8Array([1]), { 'content-type': 'text/html' });
    const { service } = createService();

    await expect(
      service.importFromDirectUrl(
        OWNER_ID,
        'http://93.184.216.34/page.html',
        'page',
        [],
      ),
    ).rejects.toThrow(
      'The source URL does not point to a supported media file.',
    );
  });

  it('rejects a taken slug', async () => {
    mockDownload(new Uint8Array([1]));
    const existing = createMedia();
    existing.slug = 'cat-picture';
    existing.status = GolderMediaStatus.Ready;
    const { service } = createService({
      media: existing,
      discordMessage: createDiscordMessage([
        {
          contentType: 'image/png',
          name: 'cat-picture.png',
          size: 1,
          url: 'https://cdn.discord.example/b.png',
        },
      ]),
    });

    await expect(
      service.importFromDiscordMessage(
        OWNER_ID,
        { channelId: '1', messageId: '2' },
        'cat-picture',
        [],
      ),
    ).rejects.toThrow('This slug is already taken.');
  });

  it('imports media from embeds when there are no attachments', async () => {
    mockDownload(new Uint8Array([7, 7]), {
      'content-type': 'video/quicktime',
    });
    const { service } = createService({
      discordMessage: createDiscordMessage(
        [],
        [],
        [
          {
            url: 'https://cdn.discord.example/mov/generated_video.mov',
            video: {
              url: 'https://cdn.discord.example/mov/generated_video.mov?ex=1&hm=2',
            },
          },
        ],
      ),
    });

    const items = await service.importFromDiscordMessage(
      OWNER_ID,
      { channelId: '1', messageId: '2' },
      'embed-clip',
      [],
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.contentType).toBe('video/quicktime');
    expect(items[0]?.sizeBytes).toBe('2');
  });

  it('rejects messages without supported attachments', async () => {
    const { service } = createService({
      discordMessage: createDiscordMessage([
        {
          contentType: 'application/pdf',
          name: 'doc.pdf',
          size: 3,
          url: 'https://cdn.discord.example/a.pdf',
        },
      ]),
    });

    await expect(
      service.importFromDiscordMessage(
        OWNER_ID,
        { channelId: '1', messageId: '2' },
        'doc',
        [],
      ),
    ).rejects.toThrow('No supported attachments found in this message.');
  });

  it('reports a missing message as not found', async () => {
    const { service } = createService();

    await expect(
      service.importFromDiscordMessage(
        OWNER_ID,
        { channelId: '1', messageId: '2' },
        'doc',
        [],
      ),
    ).rejects.toThrow('Discord message was not found or is not accessible.');
  });
});
