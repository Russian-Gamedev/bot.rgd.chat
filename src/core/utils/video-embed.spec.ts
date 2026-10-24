import { afterEach, describe, expect, it } from 'bun:test';

import {
  installFetch,
  jsonResponse,
  mediaResponse,
  restoreFetch,
} from '../../../tests/helpers/mock-fetch';
import { detectEmbedMediaKind } from './video-embed';

afterEach(restoreFetch);

describe('detectEmbedMediaKind', () => {
  describe('X/Twitter', () => {
    it('returns video for a post with native video', async () => {
      installFetch(() =>
        jsonResponse({
          code: 200,
          tweet: {
            media: { all: [{ type: 'video' }], videos: [{ type: 'video' }] },
          },
        }),
      );

      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('video');
    });

    it('returns no-video for a post with only photos', async () => {
      installFetch(() =>
        jsonResponse({
          code: 200,
          tweet: {
            media: { all: [{ type: 'photo' }], photos: [{ type: 'photo' }] },
          },
        }),
      );

      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('no-video');
    });

    it('returns no-video for a text-only post', async () => {
      installFetch(() => jsonResponse({ code: 200, tweet: { text: 'hello' } }));

      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('no-video');
    });

    it('returns video when the quoted post has video and the post has no media', async () => {
      installFetch(() =>
        jsonResponse({
          code: 200,
          tweet: { quote: { media: { videos: [{ type: 'video' }] } } },
        }),
      );

      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('video');
    });

    it('ignores the quoted post media when the post has its own photos', async () => {
      installFetch(() =>
        jsonResponse({
          code: 200,
          tweet: {
            media: { all: [{ type: 'photo' }], photos: [{ type: 'photo' }] },
            quote: { media: { videos: [{ type: 'video' }] } },
          },
        }),
      );

      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('no-video');
    });

    it('queries the fix-embed API with the status id', async () => {
      const fetchMock = installFetch((url, init) => {
        expect(url).toBe('https://api.fxtwitter.com/status/42');
        expect(init?.method).toBeUndefined();
        return jsonResponse({ code: 200, tweet: { text: 'hello' } });
      });

      await detectEmbedMediaKind(
        'https://fxtwitter.com/user/status/42/photo/1',
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not query anything for a profile url', async () => {
      const fetchMock = installFetch(() => jsonResponse({}));

      expect(await detectEmbedMediaKind('https://fxtwitter.com/user')).toBe(
        'no-video',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('treats a missing post as no-video', async () => {
      installFetch(() => jsonResponse({ code: 404 }, 404));
      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('no-video');

      installFetch(() => jsonResponse({ code: 404 }));
      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('no-video');
    });

    it('returns unknown for API errors, invalid json and network failures', async () => {
      installFetch(() => jsonResponse({ code: 500 }, 500));
      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('unknown');

      installFetch(() => new Response('not json', { status: 200 }));
      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('unknown');

      installFetch(() => {
        throw new DOMException('The operation was aborted.', 'AbortError');
      });
      expect(
        await detectEmbedMediaKind('https://fxtwitter.com/user/status/1'),
      ).toBe('unknown');
    });
  });

  describe('Instagram', () => {
    it('probes posts with a crawler HEAD request', async () => {
      const fetchMock = installFetch((url, init) => {
        expect(url).toBe('https://kkinstagram.com/p/abc');
        expect(init?.method).toBe('HEAD');
        expect(init?.redirect).toBe('follow');
        const headers = (init?.headers ?? {}) as Record<string, string>;
        expect(headers['user-agent']).toContain('Discordbot');
        return mediaResponse('image/jpeg');
      });

      expect(await detectEmbedMediaKind('https://kkinstagram.com/p/abc')).toBe(
        'no-video',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns video when the post redirects to a video file', async () => {
      installFetch(() => mediaResponse('video/mp4'));

      expect(await detectEmbedMediaKind('https://kkinstagram.com/p/abc')).toBe(
        'video',
      );
    });

    it('returns unknown when a post probe is inconclusive', async () => {
      installFetch(() => mediaResponse('text/html'));

      expect(await detectEmbedMediaKind('https://kkinstagram.com/p/abc')).toBe(
        'unknown',
      );
    });

    it('treats reels as video when the fix host serves an html page', async () => {
      installFetch(() => mediaResponse('text/html'));

      expect(
        await detectEmbedMediaKind('https://kkinstagram.com/reel/abc'),
      ).toBe('video');
    });

    it('trusts a conclusive probe over the path expectation', async () => {
      installFetch(() => mediaResponse('image/jpeg'));

      expect(
        await detectEmbedMediaKind('https://kkinstagram.com/reel/abc'),
      ).toBe('no-video');
    });

    it('ignores non-post paths', async () => {
      const fetchMock = installFetch(() => mediaResponse('video/mp4'));

      expect(await detectEmbedMediaKind('https://kkinstagram.com/nasa/')).toBe(
        'no-video',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('TikTok', () => {
    it('returns video when the fixed url redirects to a video file', async () => {
      const fetchMock = installFetch((url, init) => {
        expect(url).toBe('https://d.tnktok.com/@user/video/1');
        expect(init?.method).toBe('HEAD');
        return mediaResponse('video/mp4');
      });

      expect(
        await detectEmbedMediaKind('https://d.tnktok.com/@user/video/1'),
      ).toBe('video');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to the path when the video probe fails', async () => {
      installFetch(() => mediaResponse('text/html', 500));

      expect(
        await detectEmbedMediaKind('https://d.tnktok.com/@user/video/1'),
      ).toBe('video');
    });

    it('treats photo posts as no-video', async () => {
      installFetch(() => mediaResponse('image/jpeg'));

      expect(
        await detectEmbedMediaKind('https://d.tnktok.com/@user/photo/1'),
      ).toBe('no-video');
    });

    it('keeps photo posts as no-video when the probe fails', async () => {
      installFetch(() => mediaResponse('text/html', 500));

      expect(
        await detectEmbedMediaKind('https://d.tnktok.com/@user/photo/1'),
      ).toBe('no-video');
    });

    it('ignores non-post paths', async () => {
      const fetchMock = installFetch(() => mediaResponse('video/mp4'));

      expect(await detectEmbedMediaKind('https://d.tnktok.com/@user')).toBe(
        'no-video',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it('returns unknown for invalid urls and foreign hosts', async () => {
    expect(await detectEmbedMediaKind('https://[invalid')).toBe('unknown');
    expect(await detectEmbedMediaKind('https://example.com/video')).toBe(
      'unknown',
    );
  });
});
