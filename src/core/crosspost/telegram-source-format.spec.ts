import { describe, expect, it, mock } from 'bun:test';

import {
  TelegramChannelSourceConfig,
  TelegramSourceAdapter,
} from './sources/telegram/telegram-source.adapter';
import {
  formatTelegramText,
  hasTelegramLinks,
  TelegramSourceUpdate,
} from './sources/telegram/telegram-source.update';
import { CrossPostSourceKind } from './types/crosspost.types';

const baseConfig: TelegramChannelSourceConfig = {
  chatId: '-100',
  printFooter: false,
  onlyWithLinks: false,
};

describe('Telegram source formatting', () => {
  it('appends linked username footer', () => {
    expect(
      formatTelegramText('Новый пост', {
        ...baseConfig,
        username: 'rgdchat',
        printFooter: true,
        footerTemplate: 'Больше про геймдев в %',
      }),
    ).toBe(
      'Новый пост\n\nБольше про геймдев в [@rgdchat](<https://t.me/rgdchat>)',
    );
  });

  it('replaces multiple footer placeholders', () => {
    expect(
      formatTelegramText('Пост', {
        ...baseConfig,
        username: 'rgdchat',
        printFooter: true,
        footerTemplate: '% и еще раз %',
      }),
    ).toBe(
      'Пост\n\n[@rgdchat](<https://t.me/rgdchat>) и еще раз [@rgdchat](<https://t.me/rgdchat>)',
    );
  });

  it('keeps text unchanged when settings are absent', () => {
    expect(formatTelegramText('Пост', baseConfig)).toBe('Пост');
  });

  it('keeps text unchanged when printFooter is enabled without a template', () => {
    expect(
      formatTelegramText('Пост', {
        ...baseConfig,
        username: 'rgdchat',
        printFooter: true,
      }),
    ).toBe('Пост');
  });

  it('detects text without links', () => {
    expect(
      hasTelegramLinks(
        {
          message_id: 1,
          text: 'Просто @username',
          chat: { id: '-100' },
        },
        'Просто @username',
      ),
    ).toBe(false);
  });

  it('detects https links in text', () => {
    expect(
      hasTelegramLinks(
        {
          message_id: 1,
          text: 'Ссылка https://example.com',
          chat: { id: '-100' },
        },
        'Ссылка https://example.com',
      ),
    ).toBe(true);
  });

  it('detects Telegram url entities', () => {
    expect(
      hasTelegramLinks(
        {
          message_id: 1,
          text: 'Ссылка',
          entities: [{ type: 'text_link' }],
          chat: { id: '-100' },
        },
        'Ссылка',
      ),
    ).toBe(true);
  });

  it('skips route when onlyWithLinks is enabled and text has no links', async () => {
    const relayToRoute = mock();
    const update = new TelegramSourceUpdate(
      { relayToRoute } as never,
      {
        findEnabledRoutes: async () => [
          {
            sourceConfig: {
              ...baseConfig,
              onlyWithLinks: true,
            },
          },
        ],
      } as never,
      { getAvatarProxyUrl: () => 'https://example.com/avatar.png' } as never,
      new TelegramSourceAdapter(),
    );

    await update.onChannelPost({
      channelPost: {
        message_id: 1,
        text: 'Без ссылок',
        chat: { id: '-100', title: 'Telegram' },
      },
    } as never);

    expect(relayToRoute).not.toHaveBeenCalled();
  });

  it('relays route when onlyWithLinks is enabled and text has links', async () => {
    const relayToRoute = mock();
    const update = new TelegramSourceUpdate(
      { relayToRoute } as never,
      {
        findEnabledRoutes: async (
          sourceKind: CrossPostSourceKind,
          sourceKey: string,
        ) => [
          {
            sourceKind,
            sourceKey,
            sourceConfig: {
              ...baseConfig,
              onlyWithLinks: true,
            },
          },
        ],
      } as never,
      { getAvatarProxyUrl: () => 'https://example.com/avatar.png' } as never,
      new TelegramSourceAdapter(),
    );

    await update.onChannelPost({
      channelPost: {
        message_id: 1,
        text: 'Есть https://example.com',
        chat: { id: '-100', title: 'Telegram' },
      },
    } as never);

    expect(relayToRoute).toHaveBeenCalledTimes(1);
  });
});
