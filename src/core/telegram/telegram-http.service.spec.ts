import { afterEach, describe, expect, it, mock } from 'bun:test';

import {
  TelegramHttpError,
  TelegramHttpService,
} from './telegram-http.service';

const originalFetch = globalThis.fetch;

describe('TelegramHttpService', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
  });

  it('fetches Telegram binaries through Bun fetch', async () => {
    const fetchMock = mock(
      async () =>
        new Response('avatar', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const service = new TelegramHttpService();

    const result = await service.fetchBinary(
      'https://api.telegram.org/file/botTOKEN/photos/avatar.jpg',
    );

    expect(result).toEqual({
      contentType: 'image/png',
      buffer: Buffer.from('avatar'),
    });

    const fetchCalls = fetchMock.mock.calls as unknown as [
      unknown,
      RequestInit | undefined,
    ][];
    const [url, init] = fetchCalls[0];
    expect(String(url)).toBe(
      'https://api.telegram.org/file/botTOKEN/photos/avatar.jpg',
    );
    expect(init).toBeUndefined();
  });

  it('throws TelegramHttpError when Telegram returns an unsuccessful status', async () => {
    globalThis.fetch = mock(
      async () => new Response('missing', { status: 404 }),
    ) as unknown as typeof fetch;

    const service = new TelegramHttpService();

    await service
      .fetchBinary('https://api.telegram.org/file/botTOKEN/missing')
      .then(
        () => {
          throw new Error('Expected fetchBinary to reject');
        },
        (error) => expect(error).toBeInstanceOf(TelegramHttpError),
      );
  });
});
