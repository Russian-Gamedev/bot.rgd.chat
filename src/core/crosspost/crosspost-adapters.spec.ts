import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'bun:test';

import { DiscordSourceAdapter } from './sources/discord/discord-source.adapter';
import { TelegramSourceAdapter } from './sources/telegram/telegram-source.adapter';
import { DiscordWebhookTargetAdapter } from './targets/discord-webhook/discord-webhook-target.adapter';
import { CrossPostTargetKind } from './types/crosspost.types';

describe('Crosspost adapters', () => {
  it('builds Discord source keys', () => {
    const adapter = new DiscordSourceAdapter();

    expect(
      adapter.buildSourceKey(
        adapter.normalizeConfig({ guildId: '1', channelId: '2' }),
      ),
    ).toBe('discord:channel:2');
  });

  it('builds Telegram source keys', () => {
    const adapter = new TelegramSourceAdapter();

    expect(
      adapter.buildSourceKey(adapter.normalizeConfig({ chatId: '-100' })),
    ).toBe('telegram:chat:-100');
  });

  it('rejects invalid Discord webhook target URLs', () => {
    const adapter = new DiscordWebhookTargetAdapter({} as never);

    expect(() =>
      adapter.normalizeTarget({
        kind: CrossPostTargetKind.DiscordWebhook,
        webhookUrl: 'https://example.com/webhook',
      }),
    ).toThrow(BadRequestException);
  });
});
