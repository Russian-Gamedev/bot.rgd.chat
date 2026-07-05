import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, GuildMember, Message, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';

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
const SECOND_GUILD_ID = '222222222222222223';
const CHANNEL_ID = '333333333333333333';
const HONEYPOT_CHANNEL_ID = '333333333333333334';
const MESSAGE_ID = '444444444444444444';
const ROLE_ID = '555555555555555555';

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
  let roleAdd: ReturnType<typeof mock>;
  let roleRemove: ReturnType<typeof mock>;
  let logSend: ReturnType<typeof mock>;
  let redisStorage: Map<string, number>;
  let hasSoftbanRole: boolean;

  beforeEach(() => {
    storedCase = null;
    redisStorage = new Map();
    roleAdd = mock(async () => undefined);
    roleRemove = mock(async () => undefined);
    logSend = mock(async () => undefined);
    hasSoftbanRole = false;

    settings = {
      [GuildSettings.MahoragaEnabled]: true,
      [GuildSettings.MahoragaHoneypotMode]: MahoragaDetectionMode.On,
      [GuildSettings.MahoragaRepeatMode]: MahoragaDetectionMode.On,
      [GuildSettings.MahoragaYoungAccountMode]: MahoragaDetectionMode.Off,
      [GuildSettings.MahoragaSoftbanRoleId]: ROLE_ID,
      [GuildSettings.MahoragaHoneypotChannelId]: HONEYPOT_CHANNEL_ID,
      [GuildSettings.MahoragaLogChannelId]: CHANNEL_ID,
      [GuildSettings.MahoragaTextRepeatLimit]: 3,
      [GuildSettings.MahoragaTextWindowSeconds]: 30,
      [GuildSettings.MahoragaLinkRepeatLimit]: 3,
      [GuildSettings.MahoragaLinkWindowSeconds]: 60,
      [GuildSettings.MahoragaYoungAccountMonths]: 3,
    };

    const repository = createRepository(() => storedCase);
    const em = {
      persist: mock((entity: MahoragaCaseEntity) => {
        storedCase = entity;
        return em;
      }),
      flush: mock(async () => undefined),
    } as unknown as EntityManager;
    const redis = {
      incr: mock(async (key: string) => {
        const next = (redisStorage.get(key) ?? 0) + 1;
        redisStorage.set(key, next);
        return next;
      }),
      expire: mock(async () => undefined),
    } as unknown as Redis;
    const guildSettings = {
      getSetting: mock(async (_guildId, key, defaultValue) => {
        return settings[key as GuildSettings] ?? defaultValue;
      }),
      getGuildsWithEnabledFeature: mock(async () => [
        GUILD_ID,
        SECOND_GUILD_ID,
      ]),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async (guildId: string) => ({
          id: guildId,
          members: {
            fetch: mock(async () => ({
              roles: {
                cache: {
                  has: mock(() => hasSoftbanRole),
                },
                add: roleAdd,
                remove: roleRemove,
              },
            })),
          },
          roles: {
            fetch: mock(async () => ({ id: ROLE_ID })),
          },
          channels: {
            fetch: mock(async () => ({
              isSendable: () => true,
              send: logSend,
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
    service = new MahoragaService(
      new MahoragaDetectionService(redis, guildSettings),
      caseService,
      discordService,
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
    expect(roleAdd).not.toHaveBeenCalled();
    expect(
      logSend.mock.calls.some(([payload]) =>
        String((payload as { content?: string }).content).includes(
          'would softban',
        ),
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
    expect(roleAdd).not.toHaveBeenCalled();

    settings[GuildSettings.MahoragaHoneypotMode] = MahoragaDetectionMode.On;

    const result = await service.inspectMessage(
      createMessage({ channelId: HONEYPOT_CHANNEL_ID }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Active);
    expect(roleAdd).toHaveBeenCalledTimes(2);
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

    expect(roleAdd).not.toHaveBeenCalled();
  });

  it('creates an active case from honeypot messages and applies softban', async () => {
    const result = await service.inspectMessage(
      createMessage({ channelId: HONEYPOT_CHANNEL_ID }),
    );

    expect(result?.status).toBe(MahoragaCaseStatus.Active);
    expect(result?.reason).toBe(MahoragaReason.Honeypot);
    expect(result?.source_guild_id).toBe(BigInt(GUILD_ID));
    expect(roleAdd).toHaveBeenCalledTimes(2);
  });

  it('logs attention for young accounts with softban when youngAccountMode is on', async () => {
    settings[GuildSettings.MahoragaYoungAccountMode] = MahoragaDetectionMode.On;

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
    expect(roleAdd).toHaveBeenCalledTimes(2);
    expect(
      logSend.mock.calls.some(([payload]) =>
        String((payload as { content?: string }).content).includes('attention'),
      ),
    ).toBe(true);
  });

  it('creates one case when repeated links reach the configured threshold', async () => {
    settings[GuildSettings.MahoragaTextRepeatLimit] = 99;

    const message = createMessage({
      content: 'check https://example.com/spam?a=1&b=2',
    });

    expect(await service.inspectMessage(message)).toBeNull();
    expect(await service.inspectMessage(message)).toBeNull();

    const result = await service.inspectMessage(message);
    expect(result?.reason).toBe(MahoragaReason.LinkRepeat);
    expect(result?.matched_value).toBe('example.com/spam?a=1&b=2');

    await service.inspectMessage(message);
    expect(storedCase?.detection_count).toBe(2);
    expect(roleAdd).toHaveBeenCalledTimes(2);
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
      const message = createMessage({
        content: '',
        attachments: new Map([['attachment', attachment]]),
      });

      expect(await service.inspectMessage(message)).toBeNull();

      const result = await service.inspectMessage(message);
      expect(result?.reason).toBe(MahoragaReason.ImageRepeat);
      expect(result?.matched_value).toHaveLength(64);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
