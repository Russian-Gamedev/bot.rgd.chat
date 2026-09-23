import { describe, expect, it, mock } from 'bun:test';

import { ActorType } from '#core/permissions/permissions.types';

import { GolderController } from './golder.controller';
import { GolderService } from './golder.service';

const actor = {
  type: ActorType.User,
  id: '42',
  username: 'alice',
} as const;

describe('GolderController', () => {
  it('passes the actor user id when creating uploads', async () => {
    const golderService = {
      createUpload: mock(async () => ({
        media: {},
        upload: { url: 'signed', expiresInSeconds: 900 },
      })),
    } as unknown as GolderService;
    const controller = new GolderController(golderService);

    const result = await controller.createUpload(actor, {
      slug: 'cat-picture',
      tags: ['cat'],
      contentType: 'image/png',
      sizeBytes: 10,
    });

    expect(result.upload.url).toBe('signed');
    expect(golderService.createUpload).toHaveBeenCalledWith('42', {
      slug: 'cat-picture',
      tags: ['cat'],
      contentType: 'image/png',
      sizeBytes: 10,
    });
  });

  it('rejects non-uuid upload ids', async () => {
    const golderService = {
      completeUpload: mock(async () => ({})),
    } as unknown as GolderService;
    const controller = new GolderController(golderService);

    await expect(
      controller.completeUpload(actor, 'not-a-uuid'),
    ).rejects.toThrow('Golder media was not found.');

    expect(golderService.completeUpload).not.toHaveBeenCalled();
  });

  it('delegates deletion to the service', async () => {
    const golderService = {
      deleteMedia: mock(async () => undefined),
    } as unknown as GolderService;
    const controller = new GolderController(golderService);

    await controller.deleteMedia(actor, 'cat-picture');

    expect(golderService.deleteMedia).toHaveBeenCalledWith('42', 'cat-picture');
  });
});
