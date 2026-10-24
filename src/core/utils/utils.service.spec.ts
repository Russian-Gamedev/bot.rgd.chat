import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Message } from 'discord.js';

import {
  installFetch,
  jsonResponse,
  restoreFetch,
} from '../../../tests/helpers/mock-fetch';
import { UtilsService } from './utils.service';

afterEach(restoreFetch);

const videoTweet = {
  code: 200,
  tweet: {
    media: { all: [{ type: 'video' }], videos: [{ type: 'video' }] },
  },
};

const photoTweet = {
  code: 200,
  tweet: {
    media: { all: [{ type: 'photo' }], photos: [{ type: 'photo' }] },
  },
};

function createMessage(content: string) {
  return {
    author: { bot: false },
    webhookId: null as string | null,
    content,
    suppressEmbeds: mock(async () => undefined),
    reply: mock(async () => undefined),
  };
}

function asMessage(message: ReturnType<typeof createMessage>): Message {
  return message as unknown as Message;
}

describe('UtilsService', () => {
  describe('handleMessage', () => {
    it('replies with a fix link for a video post', async () => {
      installFetch(() => jsonResponse(videoTweet));
      const message = createMessage('look https://x.com/user/status/1');

      await new UtilsService().handleMessage(asMessage(message));

      expect(message.suppressEmbeds).toHaveBeenCalledWith(true);
      expect(message.reply).toHaveBeenCalledWith({
        content: 'https://fxtwitter.com/user/status/1',
        allowedMentions: { parse: [] },
      });
    });

    it('silently skips a post with only an image', async () => {
      installFetch(() => jsonResponse(photoTweet));
      const message = createMessage('look https://x.com/user/status/1');

      await new UtilsService().handleMessage(asMessage(message));

      expect(message.suppressEmbeds).not.toHaveBeenCalled();
      expect(message.reply).not.toHaveBeenCalled();
    });

    it('replies with only video links from a mixed message', async () => {
      installFetch((url) =>
        url.endsWith('/2')
          ? jsonResponse(videoTweet)
          : jsonResponse(photoTweet),
      );
      const message = createMessage(
        'https://x.com/a/status/1 https://x.com/b/status/2',
      );

      await new UtilsService().handleMessage(asMessage(message));

      expect(message.reply).toHaveBeenCalledWith({
        content: 'https://fxtwitter.com/b/status/2',
        allowedMentions: { parse: [] },
      });
    });

    it('ignores bot, webhook and empty messages', async () => {
      const fetchMock = installFetch(() => jsonResponse(videoTweet));

      const bot = { ...createMessage('https://x.com/a/status/1') };
      bot.author = { bot: true };
      const webhook = createMessage('https://x.com/a/status/1');
      webhook.webhookId = '1';

      const service = new UtilsService();
      await service.handleMessage(asMessage(bot));
      await service.handleMessage(asMessage(webhook));
      await service.handleMessage(asMessage(createMessage('')));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('fixVideoEmbeds', () => {
    it('rewrites video links in the content', async () => {
      installFetch(() => jsonResponse(videoTweet));

      const result = await new UtilsService().fixVideoEmbeds(
        'see https://x.com/a/status/1.',
      );

      expect(result).toEqual({
        links: [
          {
            originals: ['https://x.com/a/status/1'],
            fixed: 'https://fxtwitter.com/a/status/1',
          },
        ],
        content: 'see https://fxtwitter.com/a/status/1.',
      });
    });

    it('leaves content untouched when the link is not a video', async () => {
      installFetch(() => jsonResponse(photoTweet));
      const content = 'see https://x.com/a/status/1.';

      expect(await new UtilsService().fixVideoEmbeds(content)).toEqual({
        links: [],
        content,
      });
    });

    it('caches resolved video results', async () => {
      const fetchMock = installFetch(() => jsonResponse(videoTweet));
      const service = new UtilsService();

      await service.fixVideoEmbeds('https://x.com/a/status/1');
      await service.fixVideoEmbeds('https://twitter.com/a/status/1');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caches resolved non-video results', async () => {
      const fetchMock = installFetch(() => jsonResponse(photoTweet));
      const service = new UtilsService();

      await service.fixVideoEmbeds('https://x.com/a/status/1');
      await service.fixVideoEmbeds('https://x.com/a/status/1?s=20');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent checks of the same link', async () => {
      const fetchMock = installFetch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse(videoTweet);
      });
      const service = new UtilsService();

      await Promise.all([
        service.fixVideoEmbeds('https://x.com/a/status/1'),
        service.fixVideoEmbeds('https://twitter.com/a/status/1'),
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not cache inconclusive checks', async () => {
      const fetchMock = installFetch(() => jsonResponse({}, 500));
      const service = new UtilsService();

      await service.fixVideoEmbeds('https://x.com/a/status/1');
      await service.fixVideoEmbeds('https://x.com/a/status/1');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
