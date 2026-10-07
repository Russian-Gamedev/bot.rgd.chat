import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityRepository,
  LockMode,
  EntityManager as PostgreSqlEntityManager,
} from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { S3StorageService } from '#common/s3/s3-storage.service';
import { buildObjectKey } from '#lib/utils';

import {
  CreateProjectUploadDto,
  ProjectUploadCreatedDto,
  ProjectUploadDto,
} from './dto/projects.dto';
import { ProjectUploadEntity } from './entities/project-upload.entity';
import {
  ProjectAttachmentEntity,
  ProjectRevisionEntity,
} from './entities/projects.entity';
import {
  PROJECTS_PENDING_UPLOAD_TTL_MS,
  PROJECTS_PRESIGN_EXPIRES_SECONDS,
  PROJECTS_UNREFERENCED_UPLOAD_TTL_MS,
  PROJECTS_UPLOAD_KEY_PREFIX,
} from './projects.constants';
import { ProjectUploadStatus } from './projects.types';

@Injectable()
export class ProjectUploadsService {
  private readonly logger = new Logger(ProjectUploadsService.name);

  constructor(
    @InjectRepository(ProjectUploadEntity)
    private readonly uploads: EntityRepository<ProjectUploadEntity>,
    private readonly em: PostgreSqlEntityManager,
    private readonly storage: S3StorageService,
  ) {}

  async create(
    actorId: string,
    dto: CreateProjectUploadDto,
  ): Promise<ProjectUploadCreatedDto> {
    // Строка создаётся до presign: она — единственный учёт объекта в S3,
    // незавершённые загрузки дочищаются по ней.
    const upload = Object.assign(new ProjectUploadEntity(), {
      owner_id: BigInt(actorId),
      kind: dto.kind,
      object_key: buildObjectKey(PROJECTS_UPLOAD_KEY_PREFIX, dto.content_type),
      status: ProjectUploadStatus.Pending,
      content_type: dto.content_type,
      size_bytes: BigInt(dto.size_bytes),
    });
    await this.em.persist(upload).flush();

    const url = await this.storage.getPresignedPutUrl(
      upload.object_key,
      dto.content_type,
      PROJECTS_PRESIGN_EXPIRES_SECONDS,
    );
    return {
      upload: {
        id: upload.id,
        url,
        expires_in_seconds: PROJECTS_PRESIGN_EXPIRES_SECONDS,
      },
    };
  }

  async complete(actorId: string, id: string): Promise<ProjectUploadDto> {
    const upload = await this.uploads.findOne(id);
    if (!upload) {
      throw new NotFoundException('Project upload was not found.');
    }
    this.assertOwner(upload, actorId);

    if (upload.status !== ProjectUploadStatus.Ready) {
      const head = await this.storage.headObject(upload.object_key);
      if (!head) {
        throw new BadRequestException('The file has not been uploaded yet.');
      }
      upload.status = ProjectUploadStatus.Ready;
      await this.em.persist(upload).flush();
    }
    return this.toDto(upload);
  }

  async remove(actorId: string, id: string): Promise<void> {
    const upload = await this.uploads.findOne(id);
    if (!upload) {
      throw new NotFoundException('Project upload was not found.');
    }
    this.assertOwner(upload, actorId);
    if (await this.isReferenced(id)) {
      throw new ConflictException(
        'The upload is already used by a project revision.',
      );
    }
    await this.deleteUpload(upload);
  }

  /** Garbage-collects broken (pending) and abandoned (unreferenced) uploads. */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanup(): Promise<void> {
    const stalePending = await this.uploads.find({
      status: ProjectUploadStatus.Pending,
      createdAt: { $lt: new Date(Date.now() - PROJECTS_PENDING_UPLOAD_TTL_MS) },
    });
    for (const upload of stalePending) {
      await this.deleteUpload(upload);
    }

    const candidates = await this.uploads.find({
      status: ProjectUploadStatus.Ready,
      createdAt: {
        $lt: new Date(Date.now() - PROJECTS_UNREFERENCED_UPLOAD_TTL_MS),
      },
    });
    for (const upload of candidates) {
      await this.deleteUpload(upload);
    }
  }

  private async deleteUpload(upload: ProjectUploadEntity): Promise<void> {
    // Снимаем строку под блокировкой: если параллельное сохранение проекта
    // успело сослаться на upload — оставляем его в покое.
    const removed = await this.em.transactional(async (em) => {
      const fresh = await em.findOne(ProjectUploadEntity, upload.id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!fresh || (await this.isReferenced(fresh.id))) return null;
      await em.remove(fresh).flush();
      return fresh;
    });
    if (!removed) return;

    try {
      await this.storage.deleteObject(removed.object_key);
    } catch (error) {
      this.logger.warn(
        `Project uploads cleanup: failed to delete ${removed.object_key}: ${String(error)}`,
      );
    }
  }

  private async isReferenced(uploadId: string): Promise<boolean> {
    const [attachments, banners] = await Promise.all([
      this.em.count(ProjectAttachmentEntity, { upload: uploadId }),
      this.em.count(ProjectRevisionEntity, { bannerUpload: uploadId }),
    ]);
    return attachments + banners > 0;
  }

  private assertOwner(upload: ProjectUploadEntity, actorId: string): void {
    if (upload.owner_id.toString() !== actorId) {
      throw new ForbiddenException('Only the uploader can do this.');
    }
  }

  private toDto(upload: ProjectUploadEntity): ProjectUploadDto {
    return {
      id: upload.id,
      kind: upload.kind,
      status: upload.status,
      url: this.storage.getPublicUrl(upload.object_key),
    };
  }
}
