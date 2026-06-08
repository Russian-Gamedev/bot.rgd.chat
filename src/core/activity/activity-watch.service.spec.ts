import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  type Client,
  Collection,
  type Guild,
  type GuildMember,
  type VoiceState,
} from 'discord.js';
import type Redis from 'ioredis';
import type { ContextOf } from 'necord';

import type { UserService } from '#core/users/users.service';
import {
  ActivityWatchService,
  VOICE_ACTIVITY_STALE_TIMEOUT_MS,
} from './activity-watch.service';
import { ActivityEntity, ActivityPeriod } from './entities/activity.entity';

const GUILD_ID = '100';
const MEMBER_ID = '200';
const SECOND_MEMBER_ID = '201';
const VOICE_KEY = `activity:voice:${GUILD_ID}`;

interface VoiceStateOptions {
  channelId?: string | null;
  guild?: Guild | null;
  member?: GuildMember | null;
  serverDeaf?: boolean;
  serverMute?: boolean;
  selfDeaf?: boolean;
  selfMute?: boolean;
  suppress?: boolean;
}

interface TestMemberOptions {
  bot?: boolean;
  channelId?: string | null;
  id?: string;
  serverDeaf?: boolean;
  serverMute?: boolean;
  selfDeaf?: boolean;
  selfMute?: boolean;
  suppress?: boolean;
}

interface RedisMock extends Redis {
  storage: Map<string, Map<string, string>>;
}

interface SaveAllVoiceActivities {
  saveAllVoiceActivities(options?: {
    discardStale?: boolean;
    now?: number;
    persistOnlyTrackable?: boolean;
    reopenActive?: boolean;
  }): Promise<void>;
}

const originalDateNow = Date.now;

function setNow(now: number) {
  Date.now = mock(() => now);
}

function createRedisMock(
  initialState: Record<string, Record<string, string>> = {},
): RedisMock {
  const storage = new Map<string, Map<string, string>>();

  for (const [key, values] of Object.entries(initialState)) {
    storage.set(key, new Map(Object.entries(values)));
  }

  const redis = {
    storage,
    hget: mock(async (key: string, field: string) => {
      return storage.get(key)?.get(field) ?? null;
    }),
    hset: mock(async (key: string, field: string, value: string | number) => {
      const hash = storage.get(key) ?? new Map<string, string>();
      hash.set(field, String(value));
      storage.set(key, hash);
      return 1;
    }),
    hdel: mock(async (key: string, field: string) => {
      const hash = storage.get(key);
      if (!hash) return 0;

      const deleted = hash.delete(field) ? 1 : 0;
      if (hash.size === 0) {
        storage.delete(key);
      }
      return deleted;
    }),
    hgetall: mock(async (key: string) => {
      return Object.fromEntries(storage.get(key)?.entries() ?? []);
    }),
    keys: mock(async (pattern: string) => {
      const prefix = pattern.replace('*', '');
      return [...storage.keys()].filter((key) => key.startsWith(prefix));
    }),
  };

  return redis as unknown as RedisMock;
}

function activityKey(guildId: bigint, userId: bigint, period: ActivityPeriod) {
  return `${guildId}:${userId}:${period}`;
}

function createGuild({ afkChannelId }: { afkChannelId?: string } = {}) {
  const members = new Map<string, GuildMember>();
  const channels = new Collection<string, { isVoiceBased(): boolean }>();
  let voiceMembers = new Collection<string, GuildMember>();

  const guild = {
    afkChannelId: afkChannelId ?? null,
    id: GUILD_ID,
    members: {
      fetch: mock(async (memberId: string) => members.get(memberId) ?? null),
    },
    channels: {
      fetch: mock(async () => channels),
    },
  } as unknown as Guild;

  const setVoiceChannelMembers = (nextMembers: GuildMember[]) => {
    voiceMembers = new Collection(
      nextMembers.map((member) => [member.id, member]),
    );

    channels.clear();
    channels.set('voice-1', {
      isVoiceBased: () => true,
      members: voiceMembers,
      name: 'Voice',
    } as unknown as { isVoiceBased(): boolean });
  };

  return {
    guild,
    members,
    setVoiceChannelMembers,
  };
}

function createMember(
  guild: Guild,
  {
    bot = false,
    channelId = 'voice-1',
    id = MEMBER_ID,
    serverDeaf = false,
    serverMute = false,
    selfDeaf = false,
    selfMute = false,
    suppress = false,
  }: TestMemberOptions = {},
) {
  return {
    id,
    guild,
    user: {
      bot,
      username: `user-${id}`,
    },
    voice: {
      channel: channelId ? { id: channelId } : null,
      channelId,
      serverDeaf,
      serverMute,
      selfDeaf,
      selfMute,
      suppress,
    },
  } as unknown as GuildMember;
}

function createVoiceState(
  member: GuildMember | null,
  {
    channelId = 'voice-1',
    guild = member?.guild ?? null,
    serverDeaf = false,
    serverMute = false,
    selfDeaf = false,
    selfMute = false,
    suppress = false,
  }: VoiceStateOptions = {},
) {
  return {
    channelId,
    guild,
    member,
    serverDeaf,
    serverMute,
    selfDeaf,
    selfMute,
    suppress,
  } as unknown as VoiceState;
}

function createService(redis = createRedisMock(), guildSetup = createGuild()) {
  const activities = new Map<string, ActivityEntity>();
  const users = new Map<string, { voice_time: number }>();

  const activityRepository = {
    findOne: mock(
      async (where: {
        guild_id: bigint;
        period: ActivityPeriod;
        user_id: bigint;
      }) => {
        return (
          activities.get(
            activityKey(where.guild_id, where.user_id, where.period),
          ) ?? null
        );
      },
    ),
  } as unknown as EntityRepository<ActivityEntity>;

  const em = {
    persist: mock((entity: ActivityEntity) => {
      if (entity instanceof ActivityEntity) {
        activities.set(
          activityKey(entity.guild_id, entity.user_id, entity.period),
          entity,
        );
      }

      return em;
    }),
    flush: mock(async () => undefined),
  } as unknown as EntityManager;

  const userService = {
    findOrCreate: mock(async (guildId: bigint, userId: bigint) => {
      const key = `${guildId}:${userId}`;
      const user = users.get(key) ?? { voice_time: 0 };
      users.set(key, user);
      return user;
    }),
    addVoiceTime: mock(async (user: { voice_time: number }, amount: number) => {
      user.voice_time += amount;
    }),
    updateLastActiveAt: mock(async () => undefined),
  } as unknown as UserService;

  const discord = {
    guilds: {
      cache: new Map([[GUILD_ID, guildSetup.guild]]),
    },
  } as unknown as Client;

  const service = new ActivityWatchService(
    activityRepository,
    em,
    discord,
    redis,
    userService,
  );

  return {
    activities,
    guild: guildSetup.guild,
    guildMembers: guildSetup.members,
    redis,
    service,
    setVoiceChannelMembers: guildSetup.setVoiceChannelMembers,
    users,
  };
}

function getActivity(
  activities: Map<string, ActivityEntity>,
  memberId = MEMBER_ID,
) {
  return activities.get(
    activityKey(BigInt(GUILD_ID), BigInt(memberId), ActivityPeriod.Day),
  );
}

function voiceUpdateContext(oldState: VoiceState, newState: VoiceState) {
  return [oldState, newState] as ContextOf<'voiceStateUpdate'>;
}

describe('ActivityWatchService voice tracking', () => {
  beforeEach(() => {
    setNow(70_000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    mock.restore();
  });

  it('starts tracking when a member joins a voice channel', async () => {
    const { guild, redis, service } = createService();
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member, { channelId: null }),
        createVoiceState(member),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
  });

  it('saves elapsed voice time and stops tracking when a member leaves', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const {
      activities,
      guild,
      redis: serviceRedis,
      service,
      users,
    } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { channelId: null }),
      ),
    );

    expect(serviceRedis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBeUndefined();
    expect(getActivity(activities)?.voice).toBe(60);
    expect(users.get(`${GUILD_ID}:${MEMBER_ID}`)?.voice_time).toBe(60);
  });

  it('saves the previous segment and starts a new one when switching channels', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member, { channelId: 'voice-1' }),
        createVoiceState(member, { channelId: 'voice-2' }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
    expect(getActivity(activities)?.voice).toBe(60);
  });

  it('saves and stops tracking when a member self-deafens', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { selfDeaf: true }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBeUndefined();
    expect(getActivity(activities)?.voice).toBe(60);
  });

  it('saves and stops tracking when a member is server-deafened', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { serverDeaf: true }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBeUndefined();
    expect(getActivity(activities)?.voice).toBe(60);
  });

  it('starts tracking again when a self-deafened member undeafens in voice', async () => {
    const { guild, redis, service } = createService();
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member, { selfDeaf: true }),
        createVoiceState(member),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
  });

  it('keeps tracking when a member only self-mutes without self-deafening', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { selfMute: true }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('10000');
    expect(getActivity(activities)).toBeUndefined();
  });

  it('keeps tracking when a member is server-muted without being deafened', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { serverMute: true }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('10000');
    expect(getActivity(activities)).toBeUndefined();
  });

  it('does not start tracking when a member joins the AFK channel', async () => {
    const guildSetup = createGuild({ afkChannelId: 'afk-voice' });
    const { redis, service } = createService(createRedisMock(), guildSetup);
    const member = createMember(guildSetup.guild, { channelId: 'afk-voice' });

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member, { channelId: null }),
        createVoiceState(member, { channelId: 'afk-voice' }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)).toBeUndefined();
  });

  it('saves and stops tracking when a member moves into the AFK channel', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const guildSetup = createGuild({ afkChannelId: 'afk-voice' });
    const { activities, service } = createService(redis, guildSetup);
    const member = createMember(guildSetup.guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member, { channelId: 'voice-1' }),
        createVoiceState(member, { channelId: 'afk-voice' }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBeUndefined();
    expect(getActivity(activities)?.voice).toBe(60);
  });

  it('saves and stops tracking when a member becomes suppressed', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { suppress: true }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBeUndefined();
    expect(getActivity(activities)?.voice).toBe(60);
  });

  it('deletes invalid Redis timestamps without persisting voice time', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: 'bad-timestamp' },
    });
    const { activities, guild, service } = createService(redis);
    const member = createMember(guild);

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(member),
        createVoiceState(member, { channelId: null }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBeUndefined();
    expect(getActivity(activities)).toBeUndefined();
  });

  it('ignores bot members, missing guilds, and missing members', async () => {
    const { guild, redis, service } = createService();
    const botMember = createMember(guild, { bot: true });

    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(botMember, { channelId: null }),
        createVoiceState(botMember),
      ),
    );
    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(null, { channelId: null, guild: null, member: null }),
        createVoiceState(null, { guild: null, member: null }),
      ),
    );
    await service.onVoiceStateUpdate(
      voiceUpdateContext(
        createVoiceState(null, { channelId: null, guild }),
        createVoiceState(null, { guild }),
      ),
    );

    expect(redis.storage.get(VOICE_KEY)).toBeUndefined();
  });

  it('periodically saves tracked segments and reopens only members that are still trackable', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: {
        [MEMBER_ID]: '10000',
        [SECOND_MEMBER_ID]: '10000',
      },
    });
    const guildSetup = createGuild();
    const member = createMember(guildSetup.guild);
    const mutedMember = createMember(guildSetup.guild, {
      id: SECOND_MEMBER_ID,
      selfDeaf: true,
      selfMute: true,
    });
    guildSetup.members.set(MEMBER_ID, member);
    guildSetup.members.set(SECOND_MEMBER_ID, mutedMember);

    const { activities, service } = createService(redis, guildSetup);

    await (service as unknown as SaveAllVoiceActivities).saveAllVoiceActivities(
      {
        now: 70_000,
      },
    );

    expect(getActivity(activities)?.voice).toBe(60);
    expect(getActivity(activities, SECOND_MEMBER_ID)?.voice).toBe(60);
    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
    expect(redis.storage.get(VOICE_KEY)?.get(SECOND_MEMBER_ID)).toBeUndefined();
  });

  it('flushes active voice time on shutdown and leaves a fresh checkpoint', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const guildSetup = createGuild();
    const member = createMember(guildSetup.guild);
    guildSetup.members.set(MEMBER_ID, member);

    const { activities, service } = createService(redis, guildSetup);

    await service.beforeApplicationShutdown();

    expect(getActivity(activities)?.voice).toBe(60);
    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
  });

  it('reconciles a fresh Redis checkpoint on startup and restarts tracking', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: '10000' },
    });
    const guildSetup = createGuild();
    const member = createMember(guildSetup.guild);
    guildSetup.members.set(MEMBER_ID, member);
    guildSetup.setVoiceChannelMembers([member]);

    const { activities, service } = createService(redis, guildSetup);

    await service.onReady();

    expect(getActivity(activities)?.voice).toBe(60);
    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
  });

  it('does not credit stale Redis checkpoints on startup but starts fresh active users', async () => {
    const staleEnteredAt = 70_000 - VOICE_ACTIVITY_STALE_TIMEOUT_MS - 1;
    const redis = createRedisMock({
      [VOICE_KEY]: { [MEMBER_ID]: String(staleEnteredAt) },
    });
    const guildSetup = createGuild();
    const member = createMember(guildSetup.guild);
    guildSetup.members.set(MEMBER_ID, member);
    guildSetup.setVoiceChannelMembers([member]);

    const { activities, service } = createService(redis, guildSetup);

    await service.onReady();

    expect(getActivity(activities)).toBeUndefined();
    expect(redis.storage.get(VOICE_KEY)?.get(MEMBER_ID)).toBe('70000');
  });

  it('drops startup checkpoints for members that are gone or self-deafened', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: {
        [MEMBER_ID]: '10000',
        [SECOND_MEMBER_ID]: '10000',
      },
    });
    const guildSetup = createGuild();
    const memberOutsideVoice = createMember(guildSetup.guild, {
      channelId: null,
    });
    const mutedMember = createMember(guildSetup.guild, {
      id: SECOND_MEMBER_ID,
      selfDeaf: true,
    });
    guildSetup.members.set(MEMBER_ID, memberOutsideVoice);
    guildSetup.members.set(SECOND_MEMBER_ID, mutedMember);
    guildSetup.setVoiceChannelMembers([mutedMember]);

    const { activities, service } = createService(redis, guildSetup);

    await service.onReady();

    expect(activities.size).toBe(0);
    expect(redis.storage.get(VOICE_KEY)).toBeUndefined();
  });

  it('does not reopen startup checkpoints for AFK or suppressed members', async () => {
    const redis = createRedisMock({
      [VOICE_KEY]: {
        [MEMBER_ID]: '10000',
        [SECOND_MEMBER_ID]: '10000',
      },
    });
    const guildSetup = createGuild({ afkChannelId: 'afk-voice' });
    const afkMember = createMember(guildSetup.guild, {
      channelId: 'afk-voice',
    });
    const suppressedMember = createMember(guildSetup.guild, {
      id: SECOND_MEMBER_ID,
      suppress: true,
    });
    guildSetup.members.set(MEMBER_ID, afkMember);
    guildSetup.members.set(SECOND_MEMBER_ID, suppressedMember);
    guildSetup.setVoiceChannelMembers([afkMember, suppressedMember]);

    const { activities, service } = createService(redis, guildSetup);

    await service.onReady();

    expect(activities.size).toBe(0);
    expect(redis.storage.get(VOICE_KEY)).toBeUndefined();
  });
});
