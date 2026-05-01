import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'bun:test';

import { CrossPostRouteService } from './core/crosspost-route.service';
import { DiscordSourceAdapter } from './sources/discord/discord-source.adapter';
import { TelegramSourceAdapter } from './sources/telegram/telegram-source.adapter';
import { DiscordWebhookTargetAdapter } from './targets/discord-webhook/discord-webhook-target.adapter';
import {
  CrossPostSourceAdapter,
  CrossPostSourceKind,
  CrossPostTargetAdapter,
  CrossPostTargetKind,
} from './types/crosspost.types';

function makeService() {
  let persisted: unknown;
  const em = {
    persist(entity: unknown) {
      persisted = entity;
      return { flush: async () => undefined };
    },
    remove() {
      return { flush: async () => undefined };
    },
  };

  const repository = {
    findAll: async () => [],
    findOne: async () => null,
    find: async () => [],
  };
  const sources = new Map<CrossPostSourceKind, CrossPostSourceAdapter>([
    [CrossPostSourceKind.DiscordChannel, new DiscordSourceAdapter()],
    [CrossPostSourceKind.TelegramChannel, new TelegramSourceAdapter()],
  ]);
  const targets = new Map<CrossPostTargetKind, CrossPostTargetAdapter>([
    [
      CrossPostTargetKind.DiscordWebhook,
      new DiscordWebhookTargetAdapter({} as never),
    ],
  ]);

  const service = new CrossPostRouteService(
    repository as never,
    { nativeDelete: async () => undefined } as never,
    em as never,
    { get: (kind: CrossPostSourceKind) => sources.get(kind)! } as never,
    { get: (kind: CrossPostTargetKind) => targets.get(kind)! } as never,
  );

  return { service, getPersisted: () => persisted };
}

describe('CrossPostRouteService', () => {
  it('creates a Telegram route with multiple Discord webhook targets', async () => {
    const { service, getPersisted } = makeService();

    await service.createRoute({
      name: 'Telegram news',
      sourceKind: CrossPostSourceKind.TelegramChannel,
      sourceConfig: { chatId: '-100123', chatTitle: 'News' },
      targets: [
        {
          kind: CrossPostTargetKind.DiscordWebhook,
          webhookUrl: 'https://discord.com/api/webhooks/123/token-a',
          enabled: true,
        },
        {
          kind: CrossPostTargetKind.DiscordWebhook,
          webhookUrl: 'https://discord.com/api/webhooks/456/token-b',
          enabled: true,
        },
      ],
    });

    expect(getPersisted()).toMatchObject({
      name: 'Telegram news',
      sourceKey: 'telegram:chat:-100123',
      settings: {
        relayEdits: true,
        relayDeletes: true,
        allowedMentions: 'none',
      },
    });
  });

  it('creates a Discord route through the source adapter', async () => {
    const { service, getPersisted } = makeService();

    await service.createRoute({
      name: 'Discord news',
      sourceKind: CrossPostSourceKind.DiscordChannel,
      sourceConfig: { guildId: '1', channelId: '2' },
      targets: [
        {
          kind: CrossPostTargetKind.DiscordWebhook,
          webhookUrl: 'https://discord.com/api/webhooks/123/token-a',
          enabled: true,
        },
      ],
    });

    expect(getPersisted()).toMatchObject({
      name: 'Discord news',
      sourceKey: 'discord:channel:2',
    });
  });

  it('rejects routes without enabled targets', async () => {
    const { service } = makeService();

    await service
      .createRoute({
        name: 'Disabled',
        sourceKind: CrossPostSourceKind.DiscordChannel,
        sourceConfig: { guildId: '1', channelId: '2' },
        targets: [
          {
            kind: CrossPostTargetKind.DiscordWebhook,
            webhookUrl: 'https://discord.com/api/webhooks/123/token-a',
            enabled: false,
          },
        ],
      })
      .then(
        () => {
          throw new Error('Expected createRoute to reject');
        },
        (error) => expect(error).toBeInstanceOf(BadRequestException),
      );
  });

  it('rejects duplicate webhook URLs through the target adapter', async () => {
    const { service } = makeService();

    await service
      .createRoute({
        name: 'Duplicate',
        sourceKind: CrossPostSourceKind.DiscordChannel,
        sourceConfig: { guildId: '1', channelId: '2' },
        targets: [
          {
            kind: CrossPostTargetKind.DiscordWebhook,
            webhookUrl: 'https://discord.com/api/webhooks/123/token-a',
          },
          {
            kind: CrossPostTargetKind.DiscordWebhook,
            webhookUrl: 'https://discord.com/api/webhooks/123/token-a',
          },
        ],
      })
      .then(
        () => {
          throw new Error('Expected createRoute to reject');
        },
        (error) => expect(error).toBeInstanceOf(BadRequestException),
      );
  });
});
