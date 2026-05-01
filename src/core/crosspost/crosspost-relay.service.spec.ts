import { describe, expect, it, mock } from 'bun:test';

import { CrossPostRelayService } from './core/crosspost-relay.service';
import { CrossPostRouteEntity } from './entities/crosspost-route.entity';
import {
  CrossPostSourceKind,
  CrossPostTargetKind,
} from './types/crosspost.types';

function makeRoute(): CrossPostRouteEntity {
  const route = new CrossPostRouteEntity();
  route.id = 'route-1';
  route.enabled = true;
  route.sourceKind = CrossPostSourceKind.TelegramChannel;
  route.sourceKey = 'telegram:chat:-100123';
  route.sourceConfig = { chatId: '-100123' };
  route.settings = {
    relayEdits: true,
    relayDeletes: true,
    allowedMentions: 'none',
  };
  route.targets = [
    {
      id: 'target-1',
      kind: CrossPostTargetKind.DiscordWebhook,
      webhookUrl: 'https://discord.com/api/webhooks/123/token-a',
      enabled: true,
    },
    {
      id: 'target-2',
      kind: CrossPostTargetKind.DiscordWebhook,
      webhookUrl: 'https://discord.com/api/webhooks/456/token-b',
      enabled: true,
    },
  ];
  return route;
}

describe('CrossPostRelayService', () => {
  it('continues delivery when one target adapter call fails', async () => {
    const route = makeRoute();
    const targetAdapter = {
      create: mock(async (target: { webhookUrl: string }) => {
        if (target.webhookUrl.includes('/123/')) throw new Error('boom');
        return 'discord-message-2';
      }),
      edit: mock(),
      delete: mock(),
    };
    const persisted: unknown[] = [];

    const service = new CrossPostRelayService(
      { findOne: async () => null } as never,
      { findEnabledRoutes: async () => [route] } as never,
      { get: () => targetAdapter } as never,
      {
        persist(entity: unknown) {
          persisted.push(entity);
          return { flush: async () => undefined };
        },
      } as never,
    );

    await service.relay({
      kind: 'create',
      sourceKind: CrossPostSourceKind.TelegramChannel,
      sourceKey: 'telegram:chat:-100123',
      sourceMessageId: '42',
      text: 'hello',
      attachmentUrls: [],
      authorName: 'Telegram',
    });

    expect(targetAdapter.create).toHaveBeenCalledTimes(2);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      routeId: 'route-1',
      targetId: 'target-2',
      targetMessageId: 'discord-message-2',
    });
  });

  it('edits an existing delivery through the target adapter', async () => {
    const route = makeRoute();
    const targetAdapter = {
      create: mock(),
      edit: mock(),
      delete: mock(),
    };

    const service = new CrossPostRelayService(
      {
        findOne: async () => ({
          targetMessageId: 'discord-message-1',
          deletedAt: null,
        }),
      } as never,
      { findEnabledRoutes: async () => [route] } as never,
      { get: () => targetAdapter } as never,
      { persist: () => ({ flush: async () => undefined }) } as never,
    );

    await service.relay({
      kind: 'edit',
      sourceKind: CrossPostSourceKind.TelegramChannel,
      sourceKey: 'telegram:chat:-100123',
      sourceMessageId: '42',
      text: 'hello edited',
      attachmentUrls: [],
      authorName: 'Telegram',
    });

    expect(targetAdapter.edit).toHaveBeenCalledTimes(2);
    expect(targetAdapter.create).not.toHaveBeenCalled();
  });
});
