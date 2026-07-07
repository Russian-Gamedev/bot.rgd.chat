import { afterEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager as CoreEntityManager } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  Client,
  Collection,
  ChannelType as DiscordChannelType,
  PermissionFlagsBits,
} from 'discord.js';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import { BarWatcher } from './bar.watcher';

const GUILD_ID = '123456789';
const CHANNEL_ID = '987654321';
const PRIVATE_CHANNEL_ID = '987654399';
const ACTIVE_ROLE_ID = '555555555';
const originalDateNow = Date.now;

function setNow(now: number) {
  Date.now = mock(() => now);
}

function createEntityManager() {
  const em = Object.create(CoreEntityManager.prototype);
  em.name = 'default';
  em.fork = mock(() => em);

  return em as unknown as EntityManager;
}

function createMember(id: string, roleIds: string[]) {
  return {
    id,
    username: `user-${id}`,
    bot: false,
    displayAvatarURL: mock(() => `https://example.com/${id}.png`),
    roles: {
      cache: new Collection(roleIds.map((roleId) => [roleId, { id: roleId }])),
    },
  };
}

function createChannel(
  id: string,
  name: string,
  everyoneCanView = true,
  options: {
    everyoneCanConnect?: boolean;
    everyoneCanSend?: boolean;
    everyoneCanSendInThreads?: boolean;
    type?: DiscordChannelType;
    rawPosition?: number;
    parentId?: string | null;
  } = {},
) {
  const everyoneCanSend = options.everyoneCanSend ?? everyoneCanView;
  const everyoneCanConnect = options.everyoneCanConnect ?? everyoneCanView;
  const everyoneCanSendInThreads =
    options.everyoneCanSendInThreads ?? everyoneCanView;

  return {
    id,
    name,
    type: options.type ?? DiscordChannelType.GuildText,
    rawPosition: options.rawPosition ?? 0,
    parentId: options.parentId ?? null,
    permissionsFor: mock(() => ({
      has: mock((permission: bigint) => {
        switch (permission) {
          case PermissionFlagsBits.ViewChannel:
            return everyoneCanView;
          case PermissionFlagsBits.SendMessages:
            return everyoneCanSend;
          case PermissionFlagsBits.Connect:
            return everyoneCanConnect;
          case PermissionFlagsBits.SendMessagesInThreads:
            return everyoneCanSendInThreads;
          default:
            return false;
        }
      }),
    })),
  };
}

function createGuild(
  id: string,
  members = new Collection<string, ReturnType<typeof createMember>>(),
  channels = new Collection([
    [CHANNEL_ID, createChannel(CHANNEL_ID, 'general')],
  ]),
) {
  const everyoneRole = { id };

  return {
    id,
    name: 'Test Guild',
    iconURL: mock(() => 'https://example.com/icon.png'),
    channels: {
      cache: channels,
    },
    members: {
      cache: members,
      fetch: mock(async () => members),
    },
    roles: {
      everyone: everyoneRole,
    },
  };
}

describe('BarWatcher', () => {
  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('refreshes watched guilds before sending initial data', async () => {
    setNow(0);
    let enabledGuilds: string[] = [];
    const guild = createGuild(GUILD_ID);
    const guildSettings = {
      getGuildsWithEnabledFeature: mock(async (key: GuildSettings) => {
        expect(key).toBe(GuildSettings.BarEnabled);
        return enabledGuilds;
      }),
      getSetting: mock(async () => null),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async (guildId: string) => {
          return guildId === GUILD_ID ? guild : null;
        }),
      },
    } as unknown as Client;
    const watcher = new BarWatcher(
      createEntityManager(),
      guildSettings,
      discord,
    );

    expect(await watcher.getInitialData()).toEqual({ guilds: [] });

    enabledGuilds = [GUILD_ID];
    setNow(1000 * 60 * 60 + 1);

    expect(await watcher.getInitialData()).toEqual({
      guilds: [
        {
          id: GUILD_ID,
          name: 'Test Guild',
          icon_url: 'https://example.com/icon.png',
          channels: [
            {
              id: CHANNEL_ID,
              name: 'general',
              type: 'text',
            },
          ],
          members: [],
        },
      ],
    });
  });

  it('includes only active-role members in initial data', async () => {
    setNow(0);
    const activeMember = createMember('111111111', [ACTIVE_ROLE_ID]);
    const inactiveMember = createMember('222222222', []);
    const guild = createGuild(
      GUILD_ID,
      new Collection([
        [activeMember.id, activeMember],
        [inactiveMember.id, inactiveMember],
      ]),
    );
    const guildSettings = {
      getGuildsWithEnabledFeature: mock(async () => [GUILD_ID]),
      getSetting: mock(async (guildId: bigint, key: GuildSettings) => {
        expect(guildId).toBe(BigInt(GUILD_ID));
        expect(key).toBe(GuildSettings.ActiveRoleId);
        return ACTIVE_ROLE_ID;
      }),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async () => guild),
      },
    } as unknown as Client;
    const watcher = new BarWatcher(
      createEntityManager(),
      guildSettings,
      discord,
    );

    expect(await watcher.getInitialData()).toEqual({
      guilds: [
        {
          id: GUILD_ID,
          name: 'Test Guild',
          icon_url: 'https://example.com/icon.png',
          channels: [
            {
              id: CHANNEL_ID,
              name: 'general',
              type: 'text',
            },
          ],
          members: [
            {
              id: activeMember.id,
              username: activeMember.username,
              avatar_url: `https://example.com/${activeMember.id}.png`,
              is_bot: false,
            },
          ],
        },
      ],
    });
    expect(guild.members.fetch).not.toHaveBeenCalled();
  });

  it('includes only channels visible and usable by everyone in initial data', async () => {
    setNow(0);
    const publicChannel = createChannel(CHANNEL_ID, 'general', true);
    const privateChannel = createChannel(PRIVATE_CHANNEL_ID, 'private', false);
    const readOnlyChannel = createChannel('987654400', 'read-only', true, {
      everyoneCanSend: false,
    });
    const voiceChannel = createChannel('987654401', 'voice', true, {
      type: DiscordChannelType.GuildVoice,
      everyoneCanConnect: true,
    });
    const lockedVoiceChannel = createChannel(
      '987654402',
      'locked-voice',
      true,
      {
        type: DiscordChannelType.GuildVoice,
        everyoneCanConnect: false,
      },
    );
    const thread = createChannel('987654403', 'thread', true, {
      type: DiscordChannelType.PublicThread,
      everyoneCanSendInThreads: true,
    });
    const readOnlyThread = createChannel(
      '987654404',
      'read-only-thread',
      true,
      {
        type: DiscordChannelType.PublicThread,
        everyoneCanSendInThreads: false,
      },
    );
    const guild = createGuild(
      GUILD_ID,
      new Collection(),
      new Collection([
        [publicChannel.id, publicChannel],
        [privateChannel.id, privateChannel],
        [readOnlyChannel.id, readOnlyChannel],
        [voiceChannel.id, voiceChannel],
        [lockedVoiceChannel.id, lockedVoiceChannel],
        [thread.id, thread],
        [readOnlyThread.id, readOnlyThread],
      ]),
    );
    const guildSettings = {
      getGuildsWithEnabledFeature: mock(async () => [GUILD_ID]),
      getSetting: mock(async () => null),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async () => guild),
      },
    } as unknown as Client;
    const watcher = new BarWatcher(
      createEntityManager(),
      guildSettings,
      discord,
    );

    expect((await watcher.getInitialData()).guilds[0].channels).toEqual([
      {
        id: CHANNEL_ID,
        name: 'general',
        type: 'text',
      },
      {
        id: voiceChannel.id,
        name: 'voice',
        type: 'voice',
      },
      {
        id: thread.id,
        name: 'thread',
        type: 'thread',
      },
    ]);
    expect(publicChannel.permissionsFor).toHaveBeenCalledWith(
      guild.roles.everyone,
    );
    expect(privateChannel.permissionsFor).toHaveBeenCalledWith(
      guild.roles.everyone,
    );
  });

  it('keeps Discord channel order and excludes unsupported channel types', async () => {
    setNow(0);
    const category = createChannel('100', 'category', true, {
      type: DiscordChannelType.GuildCategory,
      rawPosition: 1,
    });
    const secondChild = createChannel('300', 'second-child', true, {
      rawPosition: 2,
      parentId: category.id,
    });
    const firstChild = createChannel('200', 'first-child', true, {
      rawPosition: 1,
      parentId: category.id,
    });
    const topLevel = createChannel('400', 'top-level', true, {
      rawPosition: 2,
    });
    const unsupported = createChannel('500', 'unsupported', true, {
      type: 15 as DiscordChannelType,
      rawPosition: 0,
    });
    const guild = createGuild(
      GUILD_ID,
      new Collection(),
      new Collection([
        [topLevel.id, topLevel],
        [secondChild.id, secondChild],
        [unsupported.id, unsupported],
        [category.id, category],
        [firstChild.id, firstChild],
      ]),
    );
    const guildSettings = {
      getGuildsWithEnabledFeature: mock(async () => [GUILD_ID]),
      getSetting: mock(async () => null),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async () => guild),
      },
    } as unknown as Client;
    const watcher = new BarWatcher(
      createEntityManager(),
      guildSettings,
      discord,
    );

    expect((await watcher.getInitialData()).guilds[0].channels).toEqual([
      {
        id: category.id,
        name: 'category',
        type: 'category',
      },
      {
        id: firstChild.id,
        name: 'first-child',
        type: 'text',
      },
      {
        id: secondChild.id,
        name: 'second-child',
        type: 'text',
      },
      {
        id: topLevel.id,
        name: 'top-level',
        type: 'text',
      },
    ]);
  });

  it('reuses an in-flight refresh for concurrent initial data requests', async () => {
    setNow(0);
    const guild = createGuild(GUILD_ID);
    let resolveRefresh: () => void = () => undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const guildSettings = {
      getGuildsWithEnabledFeature: mock(async () => {
        await refreshStarted;
        return [GUILD_ID];
      }),
      getSetting: mock(async () => null),
    } as unknown as GuildSettingsService;
    const discord = {
      guilds: {
        fetch: mock(async () => guild),
      },
    } as unknown as Client;
    const watcher = new BarWatcher(
      createEntityManager(),
      guildSettings,
      discord,
    );

    const firstInitialData = watcher.getInitialData();
    const secondInitialData = watcher.getInitialData();
    resolveRefresh();

    await Promise.all([firstInitialData, secondInitialData]);

    expect(guildSettings.getGuildsWithEnabledFeature).toHaveBeenCalledTimes(1);
    expect(discord.guilds.fetch).toHaveBeenCalledTimes(1);
  });
});
