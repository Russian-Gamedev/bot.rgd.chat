import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager } from '@mikro-orm/postgresql';
import { AuditLogEvent, Client, Guild } from 'discord.js';

import { GuildEvents } from '#config/guilds';
import { GuildMemberRolesService } from '#core/guilds/roles/guild-member-roles.service';
import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { UserService } from '#core/users/users.service';

import { GuildEventService } from './events/guild-events.service';
import { GuildWatcherService } from './guild-watcher.service';
import { GuildInviteService } from './invite/invite.service';
import { GuildSettingsService } from './settings/guild-settings.service';

interface FakeAuditEntry {
  target: { id: string } | null;
  executor: { id: string } | null;
  createdTimestamp: number;
}

type AuditEntry = {
  targetId: string;
  executorId?: string;
  createdTimestamp: number;
} | null;

function toFakeEntry(e: AuditEntry): FakeAuditEntry | null {
  if (!e) return null;
  return {
    target: { id: e.targetId },
    executor: e.executorId ? { id: e.executorId } : null,
    createdTimestamp: e.createdTimestamp,
  };
}

function makeGuild(opts: {
  banEntry?: AuditEntry;
  kickEntry?: AuditEntry;
  banThrows?: boolean;
  kickThrows?: boolean;
}): Guild {
  const mock = {
    id: 'guild-1',
    fetchAuditLogs: async (options: { type: AuditLogEvent }) => {
      if (options.type === AuditLogEvent.MemberBanAdd) {
        if (opts.banThrows) throw new Error('Missing Permissions');
        return { entries: { first: () => toFakeEntry(opts.banEntry ?? null) } };
      }
      if (options.type === AuditLogEvent.MemberKick) {
        if (opts.kickThrows) throw new Error('Missing Permissions');
        return {
          entries: { first: () => toFakeEntry(opts.kickEntry ?? null) },
        };
      }
      return { entries: { first: () => null } };
    },
  };
  return mock as unknown as Guild;
}

const MEMBER_ID = 'member-123';
const MOD_ID = 'mod-456';
const DISCORD_GUILD_ID = '333333333333333333';
const DISCORD_MEMBER_ID = '111111111111111111';
const DISCORD_MOD_ID = '222222222222222222';

describe('GuildWatcherService', () => {
  let service: GuildWatcherService;

  beforeEach(() => {
    service = new GuildWatcherService(
      Object.create(EntityManager.prototype),
      {} as Client,
      {} as GuildSettingsService,
      {} as GuildEventService,
      {} as UserService,
      {} as GuildMemberRolesService,
      {} as GuildInviteService,
    );
  });

  describe('detectLeaveReason', () => {
    it('returns MEMBER_BAN when a recent ban entry matches the member', async () => {
      const guild = makeGuild({
        banEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_BAN);
      expect(result.moderatorId).toBe(MOD_ID);
    });

    it('returns MEMBER_KICK when a recent kick entry matches the member', async () => {
      const guild = makeGuild({
        kickEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_KICK);
      expect(result.moderatorId).toBe(MOD_ID);
    });

    it('returns MEMBER_BAN (not MEMBER_KICK) when both entries exist for the same member', async () => {
      const guild = makeGuild({
        banEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
        kickEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_BAN);
    });

    it('returns MEMBER_LEAVE when no audit log entries exist', async () => {
      const guild = makeGuild({});

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_LEAVE);
      expect(result.moderatorId).toBeUndefined();
    });

    it('returns MEMBER_LEAVE when audit entry targets a different member', async () => {
      const guild = makeGuild({
        banEntry: {
          targetId: 'other-member',
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
        kickEntry: {
          targetId: 'other-member',
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_LEAVE);
    });

    it('returns MEMBER_LEAVE when ban entry is older than 5 seconds', async () => {
      const guild = makeGuild({
        banEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 6000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_LEAVE);
    });

    it('returns MEMBER_LEAVE when kick entry is older than 5 seconds', async () => {
      const guild = makeGuild({
        kickEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 6000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_LEAVE);
    });

    it('falls through to MEMBER_KICK when ban log throws', async () => {
      const guild = makeGuild({
        banThrows: true,
        kickEntry: {
          targetId: MEMBER_ID,
          executorId: MOD_ID,
          createdTimestamp: Date.now() - 1000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_KICK);
      expect(result.moderatorId).toBe(MOD_ID);
    });

    it('returns MEMBER_LEAVE when both audit log fetches throw', async () => {
      const guild = makeGuild({ banThrows: true, kickThrows: true });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_LEAVE);
    });

    it('returns undefined moderatorId when executor is null', async () => {
      const guild = makeGuild({
        banEntry: {
          targetId: MEMBER_ID,
          executorId: undefined,
          createdTimestamp: Date.now() - 1000,
        },
      });

      const result = await service.detectLeaveReason(guild, MEMBER_ID);

      expect(result.event).toBe(GuildEvents.MEMBER_BAN);
      expect(result.moderatorId).toBeUndefined();
    });
  });

  describe('onMemberLeave', () => {
    function createMemberProfile(): MemberProfileEntity {
      const user = new MemberProfileEntity();
      user.id = 1n;
      user.guild_id = BigInt(DISCORD_GUILD_ID);
      user.user_id = BigInt(DISCORD_MEMBER_ID);
      return user;
    }

    function createServiceForMemberLeave(user: MemberProfileEntity): {
      service: GuildWatcherService;
      userService: UserService;
      guildSettingsService: GuildSettingsService;
    } {
      const userService = {
        findOrCreateMember: mock(async () => user),
        leaveGuild: mock(async () => undefined),
        incrementBanCount: mock(async () => undefined),
      } as unknown as UserService;
      const guildSettingsService = {
        getEventMessageChannel: mock(async () => null),
      } as unknown as GuildSettingsService;

      return {
        service: new GuildWatcherService(
          Object.create(EntityManager.prototype),
          {} as Client,
          guildSettingsService,
          {} as GuildEventService,
          userService,
          {
            saveCurrentRoles: mock(async () => undefined),
          } as unknown as GuildMemberRolesService,
          {
            trackLeave: mock(async () => undefined),
          } as unknown as GuildInviteService,
        ),
        userService,
        guildSettingsService,
      };
    }

    function createMember(guild: Guild) {
      return {
        id: DISCORD_MEMBER_ID,
        displayName: 'Spammer',
        guild,
        roles: { cache: new Map() },
      };
    }

    it('increments user ban count when member removal is a ban', async () => {
      const guild = Object.assign(
        makeGuild({
          banEntry: {
            targetId: DISCORD_MEMBER_ID,
            executorId: DISCORD_MOD_ID,
            createdTimestamp: Date.now() - 1000,
          },
        }),
        {
          id: DISCORD_GUILD_ID,
          name: 'Guild',
          fetch: async function () {
            return this;
          },
        },
      ) as Guild;
      const user = createMemberProfile();
      const { service, userService } = createServiceForMemberLeave(user);

      await service.handleMemberLeave(createMember(guild) as never);

      expect(userService.incrementBanCount).toHaveBeenCalledWith(user.user_id);
    });

    it('does not increment user ban count for regular leave', async () => {
      const guild = Object.assign(makeGuild({}), {
        id: DISCORD_GUILD_ID,
        name: 'Guild',
        fetch: async function () {
          return this;
        },
      }) as Guild;
      const user = createMemberProfile();
      const { service, userService } = createServiceForMemberLeave(user);

      await service.handleMemberLeave(createMember(guild) as never);

      expect(userService.incrementBanCount).not.toHaveBeenCalled();
    });
  });
});
