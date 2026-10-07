import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { ProjectUploadEntity } from './entities/project-upload.entity';
import { ProjectUploadsService } from './project-uploads.service';
import { ProjectUploadKind, ProjectUploadStatus } from './projects.types';

const OWNER_ID = '357130048882343937';
const OTHER_ID = '123';
const UPLOAD_ID = '01986b4a-1a2b-7c3d-9e4f-5a6b7c8d9e0f';

function createUpload(
  overrides?: Partial<Pick<ProjectUploadEntity, 'status' | 'kind'>>,
): ProjectUploadEntity {
  const upload = new ProjectUploadEntity();
  upload.id = UPLOAD_ID;
  upload.owner_id = BigInt(OWNER_ID);
  upload.kind = overrides?.kind ?? ProjectUploadKind.Attachment;
  upload.object_key = 'projects/uuid.png';
  upload.status = overrides?.status ?? ProjectUploadStatus.Pending;
  upload.content_type = 'image/png';
  upload.size_bytes = 10n;
  upload.createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return upload;
}

function createService(overrides?: {
  upload?: ProjectUploadEntity;
  head?: { contentLength: number } | null;
  referenced?: boolean;
}) {
  const upload = overrides?.upload ?? createUpload();
  const uploadsRepository = {
    findOne: mock(async (id: string) => (id === upload.id ? upload : null)),
    find: mock(async (where: { status?: ProjectUploadStatus }) =>
      where.status === upload.status ? [upload] : [],
    ),
  };
  const entityManager = {
    persist: mock((_entity: ProjectUploadEntity) => ({
      flush: async () => undefined,
    })),
    remove: mock(() => ({ flush: async () => undefined })),
    count: mock(async () => (overrides?.referenced ? 1 : 0)),
    findOne: mock(async () => upload),
    transactional: mock(async (fn: (em: unknown) => Promise<unknown>) =>
      fn(entityManager),
    ),
  };
  const storage = {
    getPresignedPutUrl: mock(async () => 'https://signed.example/put'),
    getPublicUrl: mock((key: string) => `https://cdn.example/${key}`),
    headObject: mock(async () =>
      overrides?.head === undefined ? { contentLength: 10 } : overrides.head,
    ),
    deleteObject: mock(async () => undefined),
  };
  const service = new ProjectUploadsService(
    uploadsRepository as never,
    entityManager as never,
    storage as never,
  );
  return { service, uploadsRepository, entityManager, storage, upload };
}

let upload: ProjectUploadEntity;

beforeEach(() => {
  upload = createUpload();
});

describe('ProjectUploadsService', () => {
  it('creates a pending upload and returns a presigned url', async () => {
    const { service, entityManager, storage } = createService();

    const result = await service.create(OWNER_ID, {
      kind: ProjectUploadKind.Banner,
      content_type: 'image/png',
      size_bytes: 1024,
    });
    const persisted = entityManager.persist.mock
      .calls[0][0] as ProjectUploadEntity;

    expect(result.upload.url).toBe('https://signed.example/put');
    expect(result.upload.expires_in_seconds).toBe(15 * 60);
    expect(persisted.object_key.startsWith('projects/')).toBe(true);
    expect(persisted.object_key.endsWith('.png')).toBe(true);
    expect(persisted.status).toBe(ProjectUploadStatus.Pending);
    expect(persisted.kind).toBe(ProjectUploadKind.Banner);
    expect(storage.getPresignedPutUrl).toHaveBeenCalledWith(
      persisted.object_key,
      'image/png',
      15 * 60,
    );
  });

  it('rejects completion until the file is actually uploaded', async () => {
    const { service } = createService({ upload, head: null });
    await expect(service.complete(OWNER_ID, UPLOAD_ID)).rejects.toThrow(
      'The file has not been uploaded yet.',
    );
  });

  it('marks a completed upload as ready once the object exists', async () => {
    const { service } = createService({ upload, head: { contentLength: 10 } });

    const dto = await service.complete(OWNER_ID, UPLOAD_ID);

    expect(dto.status).toBe(ProjectUploadStatus.Ready);
    expect(dto.url).toBe('https://cdn.example/projects/uuid.png');
  });

  it('forbids other users from completing or deleting an upload', async () => {
    const { service } = createService({ upload });
    await expect(service.complete(OTHER_ID, UPLOAD_ID)).rejects.toThrow(
      'Only the uploader can do this.',
    );
    await expect(service.remove(OTHER_ID, UPLOAD_ID)).rejects.toThrow(
      'Only the uploader can do this.',
    );
  });

  it('refuses to delete an upload referenced by a project', async () => {
    const { service, storage } = createService({
      upload: createUpload({ status: ProjectUploadStatus.Ready }),
      referenced: true,
    });
    await expect(service.remove(OWNER_ID, UPLOAD_ID)).rejects.toThrow(
      'The upload is already used by a project revision.',
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced upload with its object', async () => {
    const { service, entityManager, storage } = createService({
      upload: createUpload({ status: ProjectUploadStatus.Ready }),
      referenced: false,
    });

    await service.remove(OWNER_ID, UPLOAD_ID);

    expect(entityManager.remove).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith('projects/uuid.png');
  });

  it('cleanup removes stale pending and unreferenced ready uploads', async () => {
    const pending = createUpload({ status: ProjectUploadStatus.Pending });
    const { service, entityManager, storage } = createService({
      upload: pending,
      referenced: false,
    });

    await service.cleanup();

    expect(entityManager.remove).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith(pending.object_key);
  });

  it('cleanup keeps ready uploads that are still referenced', async () => {
    const { service, entityManager, storage } = createService({
      upload: createUpload({ status: ProjectUploadStatus.Ready }),
      referenced: true,
    });

    await service.cleanup();

    expect(entityManager.remove).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
