import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import type { EntityRepository } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import {
  Client,
  Collection,
  type Message,
  MessageReferenceType,
  WebhookClient,
} from 'discord.js';
import type Redis from 'ioredis';

import type { UtilsService } from '#core/utils/utils.service';
import { PortalEntity } from './entities/portal.entity';
import { PortalBlacklistEntity } from './entities/portal-blacklist.entity';
import { PortalsService } from './portals.service';

const GUILD_ID = '111111111111111111';
const CHANNEL_ID = '222222222222222222';
const TARGET_GUILD_ID = '333333333333333333';
const TARGET_CHANNEL_ID = '444444444444444444';
const MESSAGE_ID = '555555555555555555';
const ORIGINAL_MESSAGE_ID = '666666666666666666';
const ORIGINAL_CHANNEL_ID = '999999999999999999';

function makeMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    id: MESSAGE_ID,
    channelId: CHANNEL_ID,
    guildId: GUILD_ID,
    webhookId: null,
    content: '',
    author: {
      id: '777777777777777777',
      bot: false,
      username: 'forwarder',
      displayAvatarURL: () => 'https://cdn.test/forwarder.png',
    },
    member: { displayName: 'Forwarder' },
    attachments: new Collection(),
    embeds: [],
    reference: null,
    messageSnapshots: new Collection(),
    ...overrides,
  } as unknown as Message;
}

function makeForwardedMessage(
  snapshotOverrides: Record<string, unknown> = {},
): Message {
  const snapshot = {
    content: 'original message',
    attachments: new Collection([
      [
        'attachment-1',
        {
          id: 'attachment-1',
          name: 'pic.png',
          url: 'https://cdn.test/pic.png',
        },
      ],
    ]),
    embeds: [{ title: 'Original embed' }],
    ...snapshotOverrides,
  };

  return makeMessage({
    reference: {
      type: MessageReferenceType.Forward,
      messageId: ORIGINAL_MESSAGE_ID,
      channelId: ORIGINAL_CHANNEL_ID,
      guildId: '999999999999999998',
    },
    messageSnapshots: new Collection([[ORIGINAL_MESSAGE_ID, snapshot]]),
  });
}

describe('PortalsService relay', () => {
  let service: PortalsService;
  let channelsFetch: ReturnType<typeof mock>;
  let referencedMessage: Record<string, unknown>;
  let send: ReturnType<typeof spyOn>;

  beforeEach(() => {
    referencedMessage = {
      author: { id: '888888888888888888', username: 'alice', bot: false },
      member: { displayName: 'Alice' },
    };
    channelsFetch = mock(async () => ({
      isTextBased: () => true,
      messages: { fetch: mock(async () => referencedMessage) },
    }));
    send = spyOn(WebhookClient.prototype, 'send').mockImplementation(
      (async () => ({ id: 'relayed-message-id' })) as never,
    );

    const portalCache = JSON.stringify({
      portalId: 1,
      targetWebhookId: 'webhook-id',
      targetWebhookToken: 'webhook-token',
      targetGuildId: TARGET_GUILD_ID,
      targetChannelId: TARGET_CHANNEL_ID,
    });
    const redis = {
      get: mock(async (key: string) => {
        if (key === 'portals:blacklist') return '[]';
        if (key === `portals:channel:${CHANNEL_ID}`) return portalCache;
        return null;
      }),
      set: mock(async () => 'OK'),
    };

    service = new PortalsService(
      {} as EntityRepository<PortalEntity>,
      {} as EntityRepository<PortalBlacklistEntity>,
      {} as EntityManager,
      { channels: { fetch: channelsFetch } } as unknown as Client,
      redis as unknown as Redis,
      {
        fixVideoEmbeds: mock(async (content: string) => ({
          links: [],
          content,
        })),
      } as unknown as UtilsService,
    );
  });

  afterEach(() => {
    send.mockRestore();
  });

  it('relays forwarded content, attachments and embeds from the snapshot', async () => {
    await service.relayMessage(makeForwardedMessage());

    expect(channelsFetch).toHaveBeenCalledWith(ORIGINAL_CHANNEL_ID);
    expect(send).toHaveBeenCalledTimes(1);

    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.content).toBe('**Переслано от Alice**\noriginal message');
    expect(payload.files).toEqual([
      expect.objectContaining({ name: 'pic.png' }),
    ]);
    expect(payload.embeds).toEqual([
      expect.objectContaining({ title: 'Original embed' }),
    ]);
    expect(payload.allowedMentions).toEqual({ parse: [] });
  });

  it('falls back to the username when the original message has no member', async () => {
    referencedMessage.member = null;

    await service.relayMessage(makeForwardedMessage());

    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.content).toBe('**Переслано от alice**\noriginal message');
  });

  it('omits the author when the original message cannot be fetched', async () => {
    channelsFetch.mockImplementation(async () => {
      throw new Error('Unknown Channel');
    });

    await service.relayMessage(makeForwardedMessage());

    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.content).toBe('**Переслано**\noriginal message');
  });

  it('keeps the forwarded text within the Discord content limit', async () => {
    await service.relayMessage(
      makeForwardedMessage({ content: 'a'.repeat(2000) }),
    );

    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;
    const content = payload.content as string;

    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content.startsWith('**Переслано от Alice**\na')).toBe(true);
    expect(content.endsWith('…')).toBe(true);
  });

  it('relays media-only forwards with just the attribution header', async () => {
    await service.relayMessage(
      makeForwardedMessage({ content: '', embeds: [] }),
    );

    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(payload.content).toBe('**Переслано от Alice**');
    expect(payload.files).toEqual([
      expect.objectContaining({ name: 'pic.png' }),
    ]);
    expect(payload.embeds).toBeUndefined();
  });

  it('keeps relaying regular messages with their own attachments', async () => {
    await service.relayMessage(
      makeMessage({
        content: 'hello',
        attachments: new Collection([
          ['attachment-2', { id: 'attachment-2', name: 'own.png' }],
        ]),
      }),
    );

    const payload = send.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(channelsFetch).not.toHaveBeenCalled();
    expect(payload.content).toBe('hello');
    expect(payload.files).toEqual([
      expect.objectContaining({ name: 'own.png' }),
    ]);
    expect(payload.embeds).toBeUndefined();
  });
});
