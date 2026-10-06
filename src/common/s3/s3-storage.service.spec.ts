import { describe, expect, it, mock } from 'bun:test';

import { S3StorageService } from './s3-storage.service';

function createStorageService(env: Record<string, string | boolean>) {
  const client = { send: mock(() => Promise.resolve({})) };
  const config = {
    get: (key: string, defaultValue?: unknown) => env[key] ?? defaultValue,
    getOrThrow: (key: string) => {
      if (!(key in env)) throw new Error(`Missing config: ${key}`);
      return env[key];
    },
  };
  const storage = new S3StorageService(client as never, config as never);
  return { storage, client };
}

describe('S3StorageService', () => {
  it('builds path-style public urls from endpoint and bucket', () => {
    const { storage } = createStorageService({
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'golder',
    });

    expect(storage.getPublicUrl('golder/abc.png')).toBe(
      'http://localhost:9000/golder/golder/abc.png',
    );
  });

  it('builds virtual-hosted public urls when path style is disabled', () => {
    const { storage } = createStorageService({
      S3_ENDPOINT: 'https://s3.yandexcloud.net',
      S3_BUCKET: 'golder',
      S3_FORCE_PATH_STYLE: false,
    });

    expect(storage.getPublicUrl('golder/abc.png')).toBe(
      'https://golder.s3.yandexcloud.net/golder/abc.png',
    );
  });

  it('prefers the configured public base url (CDN)', () => {
    const { storage } = createStorageService({
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'golder',
      S3_PUBLIC_BASE_URL: 'https://cdn.rgd.chat/',
    });

    expect(storage.getPublicUrl('golder/abc.png')).toBe(
      'https://cdn.rgd.chat/golder/abc.png',
    );
  });

  it('deletes objects by key', async () => {
    const { storage, client } = createStorageService({
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'golder',
    });

    await storage.deleteObject('golder/abc.png');

    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
