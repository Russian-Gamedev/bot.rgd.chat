import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, mock } from 'bun:test';
import type { Context, Telegraf } from 'telegraf';

import { EnvironmentVariables } from '#config/env';

import { TelegramService } from './telegram.service';
import {
  type TelegramBinaryResponse,
  TelegramHttpError,
  TelegramHttpService,
} from './telegram-http.service';

type TelegramChat = {
  photo?: {
    small_file_id?: string;
    big_file_id?: string;
  };
} | null;

function createBot() {
  const telegram = {
    getChat: mock<(_: string) => Promise<TelegramChat>>(async () => ({
      photo: {
        small_file_id: 'small-file-id',
        big_file_id: 'big-file-id',
      },
    })),
    getFileLink: mock(
      async () =>
        new URL('https://api.telegram.org/file/botTOKEN/photos/avatar.jpg'),
    ),
    options: {
      apiRoot: 'https://api.telegram.org',
    },
  };

  return {
    telegram,
    catch: mock(() => undefined),
  } as unknown as Telegraf<Context> & {
    telegram: typeof telegram;
    catch: ReturnType<typeof mock>;
  };
}

function createHttpClient() {
  return {
    fetchBinary: mock<() => Promise<TelegramBinaryResponse>>(),
  } as unknown as TelegramHttpService & {
    fetchBinary: ReturnType<typeof mock>;
  };
}

describe('TelegramService', () => {
  it('downloads the avatar through TelegramHttpService', async () => {
    const bot = createBot();
    const http = createHttpClient();
    http.fetchBinary.mockResolvedValueOnce({
      contentType: 'image/png',
      buffer: Buffer.from('avatar'),
    });

    const service = new TelegramService(
      bot,
      {} as ConfigService<EnvironmentVariables>,
      http,
    );

    const avatar = await service.fetchChatAvatar('-100123');

    expect(bot.telegram.getChat).toHaveBeenCalledWith('-100123');
    expect(bot.telegram.getFileLink).toHaveBeenCalledWith('small-file-id');
    expect(http.fetchBinary).toHaveBeenCalledWith(
      'https://api.telegram.org/file/botTOKEN/photos/avatar.jpg',
    );
    expect(avatar).toEqual({
      contentType: 'image/png',
      buffer: Buffer.from('avatar'),
    });
  });

  it('throws NotFoundException when the chat has no avatar', async () => {
    const bot = createBot();
    const http = createHttpClient();
    bot.telegram.getChat.mockResolvedValueOnce({});

    const service = new TelegramService(
      bot,
      {} as ConfigService<EnvironmentVariables>,
      http,
    );

    await service.fetchChatAvatar('-100123').then(
      () => {
        throw new Error('Expected fetchChatAvatar to reject');
      },
      (error) => expect(error).toBeInstanceOf(NotFoundException),
    );
    expect(http.fetchBinary).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when Telegram returns 404', async () => {
    const bot = createBot();
    const http = createHttpClient();
    http.fetchBinary.mockRejectedValueOnce(new TelegramHttpError(404));

    const service = new TelegramService(
      bot,
      {} as ConfigService<EnvironmentVariables>,
      http,
    );

    await service.fetchChatAvatar('-100123').then(
      () => {
        throw new Error('Expected fetchChatAvatar to reject');
      },
      (error) => expect(error).toBeInstanceOf(NotFoundException),
    );
  });

  it('throws NotFoundException when Telegram returns another unsuccessful status', async () => {
    const bot = createBot();
    const http = createHttpClient();
    http.fetchBinary.mockRejectedValueOnce(new TelegramHttpError(500));

    const service = new TelegramService(
      bot,
      {} as ConfigService<EnvironmentVariables>,
      http,
    );

    await service.fetchChatAvatar('-100123').then(
      () => {
        throw new Error('Expected fetchChatAvatar to reject');
      },
      (error) => expect(error).toBeInstanceOf(NotFoundException),
    );
  });
});
