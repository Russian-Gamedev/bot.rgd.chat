import { beforeEach, describe, expect, it } from 'bun:test';
import { AuditLogEvent, Client, Guild } from 'discord.js';

import { GuildEvents } from '#config/guilds';
import { UserService } from '#core/users/users.service';

import { GuildEventService } from './events/guild-events.service';
import { GuildInviteService } from './invite/invite.service';
import { GuildSettingsService } from './settings/guild-settings.service';
import { GuildWatcherService } from './guild-watcher.service';

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

describe('GuildWatcherService', () => {
  let service: GuildWatcherService;

  beforeEach(() => {
    service = new GuildWatcherService(
      {} as Client,
      {} as GuildSettingsService,
      {} as GuildEventService,
      {} as UserService,
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
});
