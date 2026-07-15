import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, GuildMember, Message, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';

import type { MetricsService } from '#common/metrics/metrics.service';
import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import { MahoragaCaseEntity } from './entities/mahoraga-case.entity';
import { MahoragaService } from './mahoraga.service';
import {
  MahoragaCaseStatus,
  MahoragaDetectionMode,
  MahoragaReason,
} from './mahoraga.types';
import { MahoragaCaseService } from './mahoraga-case.service';
import { MahoragaDetectionService } from './mahoraga-detection.service';
import { MahoragaDiscordService } from './mahoraga-discord.service';

const USER_ID = '111111111111111111';
const GUILD_ID = '222222222222222222';
const CHANNEL_ID = '333333333333333333';
const HONEYPOT_CHANNEL_ID = '333333333333333334';
const MESSAGE_ID = '444444444444444444';

function createRepository(getStored: () => MahoragaCaseEntity | null) {
  return {
    findOne: mock(async (query: Partial<MahoragaCaseEntity>) => {
      const stored = getStored();
      if (!stored) return null;

      if ('user_id' in query && query.user_id !== stored.user_id) return null;
      if ('status' in query) {
        const status = query.status as
          | MahoragaCaseStatus
          | { $in: MahoragaCaseStatus[] };
        if (typeof status === 'object' && '$in' in status) {
          return status.$in.includes(stored.status) ? stored : null;
        }
        return status === stored.status ? stored : null;
      }

      return stored;
    }),
    find: mock(async () => []),
  } as unknown as EntityRepository<MahoragaCaseEntity>;
}

function createMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    id: MESSAGE_ID,
    content: 'spam text',
    channelId: CHANNEL_ID,
    guildId: GUILD_ID,
    webhookId: null,
    author: {
      id: USER_ID,
      bot: false,
      createdTimestamp: Date.now() - 365 * 86_400_000,
    },
    attachments: new Map(),
    member: {
      permissions: new PermissionsBitField(0n),
    },
    guild: {
      members: {
        fetch: mock(async () => ({
          permissions: new PermissionsBitField(0n),
        })),
      },
    },
    ...overrides,
  } as unknown as Message;
}

describe('MahoragaService', () => {
  let storedCase: MahoragaCaseEntity | null;
  let service: MahoragaService;
  let settings: Partial<Record<GuildSettings, unknown>>;
  let banCreate: ReturnType<typeof mock>;
  let banRemove: ReturnType<typeof mock>;
  let logSend: ReturnType<typeof mock>;
  let fetchedMessageDelete: ReturnType<typeof mock>;
  let emClear: ReturnType<typeof mock>;
  let emFlush: ReturnType<typeof mock>;
  let redisStorage: Map<string, number>;
  let redisSetStorage: Map<string, Set<string>>;
  let processedMessages: Set<string>;
  let metrics: MetricsService;

  beforeEach(() => {
    storedCase = null;
    redisStorage = new Map();
    redisSetStorage = new Map();
    processedMessages = new Set();
    banCreate = mock(async () => undefined);
    banRemove = mock(async () => undefined);
    logSend = mock(async () => undefined);
    fetchedMessageDelete = mock(async () => undefined);
    emClear = mock(() => undefined);
    emFlush = mock(async () => undefined);

    settings = {
      [GuildSettings.MahoragaEnabled]: true,
      [GuildSettings.MahoragaHoneypotMode]: MahoragaDetectionMode.On,
      [GuildSettings.MahoragaRepeatMode]: MahoragaDetectionMode.On,
      [GuildSettings.MahoragaHoneypotChannelId]: HONEYPOT_CHANNEL_ID,
      [GuildSettings.MahoragaLogChannelId]: CHANNEL_ID,
      [GuildSettings.MahoragaTextRepeatLimit]: 3,
      [GuildSettings.MahoragaTextWindowSeconds]: 30,
      [GuildSettings.MahoragaLinkRepeatLimit]: 3,
      [GuildSettings.MahoragaLinkWindowSeconds]: 60,
    };

    const repository = createRepository(() => storedCase);
    const em = {
      persist: mock((entity: MahoragaCaseEntity) => {
        storedCase = entity;
        return em;
      }),
      flush: emFlush,
      clear: emClear,
    } as unknown as EntityManager;
    const redis = {
      set: mock(async (key: string) => {
        if (processedMessages.has(key)) return null;
        processedMessages.add(key);
        return 'OK';
      }),
      incr: mock(async (key: string) => {
        const next = (redisStorage.get(key) ?? 0) + 1;
        redisStorage.set(key, next);
        return next;
      }),
      expire: mock(async () => undefined),
      sadd: mock(async (key: string, value: string) => {
        if (!redisSetStorage.has(key)) redisSetStorage.set(key, new Set());
        redisSetStorage.get(key)!.add(value);
        return 1;
      }),
      smembers: mock(async (key: string) => {
        const set = redisSetStorage.get(key);
        return set ? [...set] : [];
      }),
      del: mock(async (key: string) => {
        const existed = redisSetStorage.has(key);
        redisSetStorage.delete(key);
        return existed ? 1 : 0;
      }),
      srem: mock(async (key: string, ...values: string[]) => {
        const set = redisSetStorage.get(key);
        if (!set) return 0;
        let removed = 0;
        for (const value of values) {
          if (set.delete(value)) removed += 1;
        }
        if (set.size === 0) redisSetStorage.delete(key);
        return removed;
      }),
    } as unknown as Redis;
    const guildSettings = {
      getSetting: mock(async (_guildId, key, defaultValue) => {
        return settings[key as GuildSettings] ?? defaultValue;
      }),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async (guildId: string) => ({
          id: guildId,
          bans: {
            create: banCreate,
            remove: banRemove,
          },
          channels: {
            fetch: mock(async () => ({
              isTextBased: () => true,
              isSendable: () => true,
              send: logSend,
              messages: {
                fetch: mock(async () => ({
                  delete: fetchedMessageDelete,
                })),
              },
            })),
          },
        })),
      },
      users: {
        fetch: mock(async () => ({
          send: mock(async () => undefined),
        })),
      },
    } as unknown as Client;

    const caseService = new MahoragaCaseService(repository, em);
    const discordService = new MahoragaDiscordService(
      discord,
      guildSettings,
      caseService,
    );
    (
      discordService as unknown as {
        waitForTemporaryBanDuration: () => Promise<void>;
      }
    ).waitForTemporaryBanDuration = mock(async () => undefined);
    metrics = {
      recordMahoragaDetection: mock(() => undefined),
    } as unknown as MetricsService;
    service = new MahoragaService(
      new MahoragaDetectionService(redis, guildSettings),
      caseService,
      discordService,
      guildSettings,
      metrics,
    );
  });

  it('creates an observed case in monitor mode without softban', async () => {
    settings[GuildSettings.MahoragaHoneypotMode] =
      MahoragaDetectionMode.Monitor;

    const result = await service.inspectMessage(
      createMessage({
        channelId: HONEYPOT_CHANNEL_ID,
        author: {
          id: USER_ID,
          bot: false,
          createdTimestamp: Date.now(),
        },
      }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Observed);
    expect(result?.reason).toBe(MahoragaReason.Honeypot);
    expect(banCreate).not.toHaveBeenCalled();
    expect(
      logSend.mock.calls.some(([payload]) =>
        JSON.stringify(payload).includes('Softban would be applied'),
      ),
    ).toBe(true);
  });

  it('promotes observed cases when enforcement mode is enabled later', async () => {
    settings[GuildSettings.MahoragaHoneypotMode] =
      MahoragaDetectionMode.Monitor;

    await service.inspectMessage(
      createMessage({ channelId: HONEYPOT_CHANNEL_ID }),
    );
    expect(storedCase?.status).toBe(MahoragaCaseStatus.Observed);
    expect(banCreate).not.toHaveBeenCalled();

    settings[GuildSettings.MahoragaHoneypotMode] = MahoragaDetectionMode.On;

    const result = await service.inspectMessage(
      createMessage({
        id: '444444444444444445',
        channelId: HONEYPOT_CHANNEL_ID,
      }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Active);
    expect(banCreate).toHaveBeenCalledTimes(1);
    expect(banRemove).toHaveBeenCalledTimes(1);
  });

  it('does not apply softban for observed cases on member join', async () => {
    const mahoragaCase = new MahoragaCaseEntity();
    mahoragaCase.user_id = BigInt(USER_ID);
    mahoragaCase.status = MahoragaCaseStatus.Observed;
    mahoragaCase.reason = MahoragaReason.Honeypot;
    storedCase = mahoragaCase;

    await service.handleMemberJoin({
      id: USER_ID,
      user: { bot: false },
      guild: { id: GUILD_ID },
    } as GuildMember);

    expect(banCreate).not.toHaveBeenCalled();
  });

  it('logs active Mahoraga users on member join without banning them', async () => {
    const mahoragaCase = new MahoragaCaseEntity();
    mahoragaCase.user_id = BigInt(USER_ID);
    mahoragaCase.status = MahoragaCaseStatus.Active;
    mahoragaCase.reason = MahoragaReason.Honeypot;
    storedCase = mahoragaCase;

    await service.handleMemberJoin({
      id: USER_ID,
      user: { bot: false },
      guild: { id: GUILD_ID },
    } as GuildMember);

    expect(banCreate).not.toHaveBeenCalled();
    expect(
      logSend.mock.calls.some(([payload]) =>
        JSON.stringify(payload).includes('Mahoraga Rejoin'),
      ),
    ).toBe(true);
  });

  it('creates an active case from honeypot messages and applies softban', async () => {
    const result = await service.inspectMessage(
      createMessage({ channelId: HONEYPOT_CHANNEL_ID }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Active);
    expect(result?.reason).toBe(MahoragaReason.Honeypot);
    expect(result?.source_guild_id).toBe(BigInt(GUILD_ID));
    expect(banCreate).toHaveBeenCalledTimes(1);
    expect(banCreate).toHaveBeenCalledWith(USER_ID, {
      reason: `Mahoraga ${MahoragaReason.Honeypot}`,
      deleteMessageSeconds: 3600,
    });
    expect(banRemove).toHaveBeenCalledTimes(1);
    expect(metrics.recordMahoragaDetection).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      reason: MahoragaReason.Honeypot,
      mode: MahoragaDetectionMode.On,
      status: MahoragaCaseStatus.Active,
    });
  });

  it('retries case registration when concurrent insert wins the unique user constraint', async () => {
    let flushCalls = 0;
    emFlush.mockImplementation(async () => {
      flushCalls += 1;
      if (flushCalls === 1) {
        storedCase = new MahoragaCaseEntity();
        storedCase.user_id = BigInt(USER_ID);
        storedCase.status = MahoragaCaseStatus.Active;
        storedCase.reason = MahoragaReason.Honeypot;
        throw new UniqueConstraintViolationException(new Error('duplicate'));
      }
    });

    const result = await service.inspectMessage(
      createMessage({ channelId: HONEYPOT_CHANNEL_ID }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Active);
    expect(emClear).toHaveBeenCalledTimes(1);
    expect(emFlush).toHaveBeenCalledTimes(2);
  });

  it('reapplies softban and cleans tracked messages for repeat honeypot detections on active cases', async () => {
    await service.inspectMessage(
      createMessage({
        id: '444444444444444481',
        channelId: HONEYPOT_CHANNEL_ID,
      }),
    );

    const messageDelete = mock(async () => undefined);
    await service.inspectMessage(
      createMessage({
        id: '444444444444444482',
        channelId: HONEYPOT_CHANNEL_ID,
        delete: messageDelete,
      }),
    );

    expect(banCreate).toHaveBeenCalledTimes(2);
    expect(banRemove).toHaveBeenCalledTimes(2);
    expect(messageDelete).not.toHaveBeenCalled();
    expect(fetchedMessageDelete).toHaveBeenCalledTimes(2);
    expect(
      redisSetStorage.has(`mahoraga:messages:${GUILD_ID}:${USER_ID}`),
    ).toBe(false);
  });

  it('does not log young account warnings', async () => {
    const result = await service.inspectMessage(
      createMessage({
        channelId: HONEYPOT_CHANNEL_ID,
        author: {
          id: USER_ID,
          bot: false,
          createdTimestamp: Date.now(),
        },
      }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Active);
    expect(banCreate).toHaveBeenCalledTimes(1);
    expect(
      logSend.mock.calls.some(([payload]) =>
        JSON.stringify(payload).includes('Young Account Warning'),
      ),
    ).toBe(false);
  });

  it('creates one case when repeated links reach the configured threshold', async () => {
    settings[GuildSettings.MahoragaTextRepeatLimit] = 99;

    const content = 'check https://example.com/spam?a=1&b=2';

    expect(
      await service.inspectMessage(
        createMessage({ id: '444444444444444411', content }),
      ),
    ).toBeNull();
    expect(
      await service.inspectMessage(
        createMessage({ id: '444444444444444412', content }),
      ),
    ).toBeNull();

    const result = await service.inspectMessage(
      createMessage({ id: '444444444444444413', content }),
    );
    expect(result?.reason).toBe(MahoragaReason.LinkRepeat);
    expect(result?.matched_value).toBe('example.com/spam?a=1&b=2');

    await service.inspectMessage(
      createMessage({ id: '444444444444444414', content }),
    );
    expect(storedCase?.detection_count).toBe(2);
    expect(banCreate).toHaveBeenCalledTimes(2);
    expect(banRemove).toHaveBeenCalledTimes(2);
  });

  it('verifies tracked messages after temporary ban when repeated links reach the threshold', async () => {
    settings[GuildSettings.MahoragaTextRepeatLimit] = 99;

    const messageDelete = mock(async () => undefined);
    const content = 'check https://example.com/spam?a=1&b=2';

    expect(
      await service.inspectMessage(
        createMessage({ id: '444444444444444441', content }),
      ),
    ).toBeNull();
    expect(
      await service.inspectMessage(
        createMessage({ id: '444444444444444442', content }),
      ),
    ).toBeNull();

    const result = await service.inspectMessage(
      createMessage({
        id: '444444444444444443',
        content,
        delete: messageDelete,
      }),
    );

    expect(result?.reason).toBe(MahoragaReason.LinkRepeat);
    expect(messageDelete).not.toHaveBeenCalled();
    expect(banCreate).toHaveBeenCalledTimes(1);
    expect(banRemove).toHaveBeenCalledTimes(1);
    expect(fetchedMessageDelete).toHaveBeenCalledTimes(3);
    expect(
      redisSetStorage.has(`mahoraga:messages:${GUILD_ID}:${USER_ID}`),
    ).toBe(false);
  });

  it('ignores malformed Redis message entries during cleanup', async () => {
    settings[GuildSettings.MahoragaTextRepeatLimit] = 99;

    const content = 'check https://example.com/spam?a=1&b=2';
    await service.inspectMessage(
      createMessage({ id: '444444444444444491', content }),
    );
    redisSetStorage
      .get(`mahoraga:messages:${GUILD_ID}:${USER_ID}`)!
      .add('malformed-entry');
    await service.inspectMessage(
      createMessage({ id: '444444444444444492', content }),
    );
    await service.inspectMessage(
      createMessage({ id: '444444444444444493', content }),
    );

    expect(fetchedMessageDelete).toHaveBeenCalledTimes(3);
    expect(
      redisSetStorage.get(`mahoraga:messages:${GUILD_ID}:${USER_ID}`),
    ).toEqual(new Set(['malformed-entry']));
  });

  it('does not delete tracked messages for repeated text in monitor mode', async () => {
    settings[GuildSettings.MahoragaRepeatMode] = MahoragaDetectionMode.Monitor;
    settings[GuildSettings.MahoragaTextRepeatLimit] = 2;

    const messageDelete = mock(async () => undefined);
    const content = 'same spam text';

    expect(
      await service.inspectMessage(
        createMessage({ id: '444444444444444451', content }),
      ),
    ).toBeNull();

    const result = await service.inspectMessage(
      createMessage({
        id: '444444444444444452',
        content,
        delete: messageDelete,
      }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Observed);
    expect(result?.reason).toBe(MahoragaReason.TextRepeat);
    expect(messageDelete).not.toHaveBeenCalled();
    expect(fetchedMessageDelete).not.toHaveBeenCalled();
    expect(
      redisSetStorage.has(`mahoraga:messages:${GUILD_ID}:${USER_ID}`),
    ).toBe(true);
  });

  it('clears tracked messages when a case is pardoned', async () => {
    await service.inspectMessage(
      createMessage({
        id: '444444444444444501',
        channelId: HONEYPOT_CHANNEL_ID,
      }),
    );
    redisSetStorage.set(
      `mahoraga:messages:${GUILD_ID}:${USER_ID}`,
      new Set([`${CHANNEL_ID}:444444444444444502`]),
    );

    await service.pardonCase(USER_ID, USER_ID, 'appeal accepted');

    expect(
      redisSetStorage.has(`mahoraga:messages:${GUILD_ID}:${USER_ID}`),
    ).toBe(false);
    expect(metrics.recordMahoragaDetection).toHaveBeenCalledWith({
      guildId: GUILD_ID,
      reason: MahoragaReason.Honeypot,
      mode: MahoragaDetectionMode.Off,
      status: MahoragaCaseStatus.Pardoned,
    });
  });

  it('logs monitor detections only on the first observed case', async () => {
    settings[GuildSettings.MahoragaRepeatMode] = MahoragaDetectionMode.Monitor;
    settings[GuildSettings.MahoragaTextRepeatLimit] = 2;

    const content = 'same monitor spam text';

    expect(
      await service.inspectMessage(
        createMessage({ id: '444444444444444471', content }),
      ),
    ).toBeNull();

    await service.inspectMessage(
      createMessage({ id: '444444444444444472', content }),
    );
    await service.inspectMessage(
      createMessage({ id: '444444444444444473', content }),
    );

    const monitorLogs = logSend.mock.calls.filter(([payload]) =>
      JSON.stringify(payload).includes('Mahoraga Monitor'),
    );
    expect(monitorLogs).toHaveLength(1);
    expect(banCreate).not.toHaveBeenCalled();
  });

  it('creates a case when repeated image hashes reach the threshold', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response(new Uint8Array([1, 2, 3, 4])),
    ) as unknown as typeof fetch;

    try {
      const attachment = {
        contentType: 'image/png',
        name: 'spam.png',
        url: 'https://cdn.example.com/spam.png',
      };
      expect(
        await service.inspectMessage(
          createMessage({
            id: '444444444444444421',
            content: '',
            attachments: new Map([['attachment', attachment]]),
          }),
        ),
      ).toBeNull();

      const result = await service.inspectMessage(
        createMessage({
          id: '444444444444444422',
          content: '',
          attachments: new Map([['attachment', attachment]]),
        }),
      );
      expect(result?.reason).toBe(MahoragaReason.ImageRepeat);
      expect(result?.matched_value).toHaveLength(64);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('verifies tracked messages after temporary ban when repeated image hashes reach the threshold', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response(new Uint8Array([1, 2, 3, 4])),
    ) as unknown as typeof fetch;

    try {
      const messageDelete = mock(async () => undefined);
      const attachment = {
        contentType: 'image/png',
        name: 'spam.png',
        url: 'https://cdn.example.com/spam.png',
      };

      expect(
        await service.inspectMessage(
          createMessage({
            id: '444444444444444461',
            content: '',
            attachments: new Map([['attachment', attachment]]),
          }),
        ),
      ).toBeNull();

      const result = await service.inspectMessage(
        createMessage({
          id: '444444444444444462',
          content: '',
          attachments: new Map([['attachment', attachment]]),
          delete: messageDelete,
        }),
      );

      expect(result?.reason).toBe(MahoragaReason.ImageRepeat);
      expect(messageDelete).not.toHaveBeenCalled();
      expect(banCreate).toHaveBeenCalledTimes(1);
      expect(banRemove).toHaveBeenCalledTimes(1);
      expect(fetchedMessageDelete).toHaveBeenCalledTimes(2);
      expect(
        redisSetStorage.has(`mahoraga:messages:${GUILD_ID}:${USER_ID}`),
      ).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('processes the same Discord message only once', async () => {
    settings[GuildSettings.MahoragaTextRepeatLimit] = 2;
    const message = createMessage({ content: 'duplicate gateway event' });

    const [first, duplicate] = await Promise.all([
      service.inspectMessage(message),
      service.inspectMessage(message),
    ]);

    expect(first).toBeNull();
    expect(duplicate).toBeNull();
    expect([...redisStorage.values()]).toEqual([1]);
    expect(storedCase).toBeNull();
    expect(banCreate).not.toHaveBeenCalled();
  });

  it('does not treat ten different images in one message as image repeats', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (input) => {
      const index = Number(String(input).match(/art-(\d+)\.png/)?.[1]);
      return new Response(new Uint8Array([index]));
    }) as unknown as typeof fetch;

    try {
      const attachments = new Map(
        Array.from({ length: 10 }, (_, index) => [
          `attachment-${index}`,
          {
            contentType: 'image/png',
            name: `art-${index}.png`,
            url: `https://cdn.example.com/art-${index}.png`,
          },
        ]),
      );

      const result = await service.inspectMessage(
        createMessage({ content: '', attachments }),
      );

      expect(result).toBeNull();
      expect(
        [...redisStorage.keys()].filter((key) =>
          key.startsWith('mahoraga:detector:image:'),
        ),
      ).toHaveLength(10);
      expect(storedCase).toBeNull();
      expect(banCreate).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not count the same image twice when the message id is duplicated', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = mock(
      async () => new Response(new Uint8Array([1, 2, 3, 4])),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const message = createMessage({
        content: '',
        attachments: new Map([
          [
            'attachment',
            {
              contentType: 'image/png',
              name: 'spam.png',
              url: 'https://cdn.example.com/spam.png',
            },
          ],
        ]),
      });

      expect(await service.inspectMessage(message)).toBeNull();
      expect(await service.inspectMessage(message)).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect([...redisStorage.values()]).toEqual([1]);
      expect(storedCase).toBeNull();
      expect(banCreate).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
