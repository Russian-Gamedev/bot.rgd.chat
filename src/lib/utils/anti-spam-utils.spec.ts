import { describe, expect, it } from 'bun:test';

import {
  extractNormalizedUrls,
  hashArrayBuffer,
  hitFixedWindowThreshold,
  isImageAttachment,
  normalizeMessageText,
  normalizeUrl,
} from '.';

describe('anti-spam utilities', () => {
  it('normalizes message text', () => {
    expect(normalizeMessageText('  HELLO\u200B   World  ')).toBe('hello world');
  });

  it('normalizes URLs and sorts query parameters', () => {
    expect(normalizeUrl('HTTPS://Example.COM/path/?b=2&a=1#hash')).toBe(
      'example.com/path?a=1&b=2',
    );
    expect(normalizeUrl('www.example.com/test,')).toBe('example.com/test');
  });

  it('extracts unique normalized URLs', () => {
    expect(
      extractNormalizedUrls(
        'go https://example.com/a?b=2&a=1 and https://example.com/a?a=1&b=2',
      ),
    ).toEqual(['example.com/a?a=1&b=2']);
  });

  it('detects image attachments from content-type and filename', () => {
    expect(isImageAttachment({ contentType: 'image/png' })).toBe(true);
    expect(isImageAttachment({ name: 'proof.webp' })).toBe(true);
    expect(isImageAttachment({ name: 'archive.zip' })).toBe(false);
  });

  it('hashes array buffers consistently', () => {
    const buffer = new TextEncoder().encode('same-image').buffer;
    expect(hashArrayBuffer(buffer)).toBe(hashArrayBuffer(buffer));
  });

  it('uses fixed Redis windows for threshold checks', async () => {
    const storage = new Map<string, number>();
    const expirations: { key: string; seconds: number }[] = [];
    const redis = {
      incr: async (key: string) => {
        const next = (storage.get(key) ?? 0) + 1;
        storage.set(key, next);
        return next;
      },
      expire: async (key: string, seconds: number) => {
        expirations.push({ key, seconds });
      },
    };

    expect(await hitFixedWindowThreshold(redis, 'mahoraga:test', 3, 30)).toBe(
      false,
    );
    expect(await hitFixedWindowThreshold(redis, 'mahoraga:test', 3, 30)).toBe(
      false,
    );
    expect(await hitFixedWindowThreshold(redis, 'mahoraga:test', 3, 30)).toBe(
      true,
    );
    expect(expirations).toEqual([{ key: 'mahoraga:test', seconds: 30 }]);
  });
});
