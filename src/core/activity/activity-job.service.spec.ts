import { describe, expect, it, mock } from 'bun:test';
import type { EntityManager } from '@mikro-orm/core';
import type { Client, Guild } from 'discord.js';

import { EmojiCoin } from '#config/emojies';
import { GuildEvents } from '#config/guilds';
import type { GuildEventService } from '#core/guilds/events/guild-events.service';
import type { GuildMemberRolesService } from '#core/guilds/roles/guild-member-roles.service';
import type { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import type { UserService } from '#core/users/users.service';
import type { WalletService } from '#core/wallet/wallet.service';
import type { ActivityService } from './activity.service';
import { ActivityJobService } from './activity-job.service';
import { ActivityPeriod, getActivityPeriodRange } from './activity-period';

interface PrivateActivityJobService {
  postActivitySummary(guild: Guild, period: ActivityPeriod): Promise<void>;
  postActivitySummarySafely(
    guild: Guild,
    period: ActivityPeriod,
  ): Promise<void>;
}

function createService(
  options: {
    channel?: {
      isSendable(): boolean;
      send?: (payload: unknown) => Promise<void>;
    };
    channelId?: string | null;
    postMessages?: boolean;
    stats?: unknown[];
    eventTemplate?: string | null;
  } = {},
) {
  const activityService = {
    getActivityStatsInRange: mock(async () => options.stats ?? []),
    getTopMemberStreaks: mock(async () => []),
  } as unknown as ActivityService;
  const userService = {
    getNewUsers: mock(async () => []),
    findOrCreateMember: mock(async (_guildId: bigint, userId: bigint) => ({
      user_id: userId,
      guild_id: _guildId,
    })),
  } as unknown as UserService;
  const walletService = {
    credit: mock(async () => ({})),
  } as unknown as WalletService;
  const guildEventService = {
    getRandom: mock(async () => options.eventTemplate ?? null),
  } as unknown as GuildEventService;
  const guildSettings = {
    asBoolean: mock((value) => value === true || value === 'true'),
    getSetting: mock(async (_guildId, key, defaultValue) => {
      if (key === 'post_activity_messages') {
        return options.postMessages ?? defaultValue;
      }
      if (key === 'event_message_channel') {
        return options.channelId;
      }
      return defaultValue;
    }),
  } as unknown as GuildSettingsService;
  const guild = {
    channels: {
      fetch: mock(async () => options.channel ?? null),
    },
    id: '1127255165548888196',
  } as unknown as Guild;

  const service = new ActivityJobService(
    {} as EntityManager,
    {} as Client,
    activityService,
    userService,
    walletService,
    guildSettings,
    {} as GuildMemberRolesService,
    guildEventService,
  );

  return {
    activityService,
    guild,
    guildEventService,
    guildSettings,
    service: service as unknown as PrivateActivityJobService,
    userService,
    walletService,
  };
}

describe('ActivityJobService', () => {
  it('builds daily activity range from the Moscow calendar day', () => {
    expect(
      getActivityPeriodRange(
        ActivityPeriod.Day,
        new Date('2026-07-06T15:08:34.000Z'),
      ),
    ).toEqual(['2026-07-06', '2026-07-07']);
  });

  it('skips publishing when the configured channel is missing', async () => {
    const { activityService, guild, service } = createService({
      channelId: null,
      postMessages: true,
      stats: [
        {
          guild_id: 1127255165548888196n,
          message_score: 1,
          reaction_count: 0,
          user_id: 1n,
          voice_seconds: 0,
        },
      ],
    });

    await service.postActivitySummary(guild, ActivityPeriod.Day);

    expect(activityService.getActivityStatsInRange).toHaveBeenCalled();
  });

  it('does not throw when summary sending fails', async () => {
    const send = mock(async () => {
      throw new Error('missing access');
    });
    const { guild, service } = createService({
      channel: {
        isSendable: () => true,
        send,
      },
      channelId: '1127255167096586252',
      postMessages: true,
      stats: [
        {
          guild_id: 1127255165548888196n,
          message_score: 1,
          reaction_count: 0,
          user_id: 1n,
          voice_seconds: 0,
        },
      ],
    });

    await expect(
      service.postActivitySummarySafely(guild, ActivityPeriod.Day),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalled();
  });

  it('raffles coins among active users after publishing the summary', async () => {
    const send = mock(async () => undefined);
    const { guild, service, userService, walletService } = createService({
      channel: {
        isSendable: () => true,
        send,
      },
      channelId: '1127255167096586252',
      postMessages: true,
      stats: [
        {
          guild_id: 1127255165548888196n,
          message_score: 5,
          reaction_count: 0,
          user_id: 42n,
          voice_seconds: 0,
        },
      ],
    });

    await service.postActivitySummary(guild, ActivityPeriod.Day);

    expect(walletService.credit).toHaveBeenCalledWith(
      42n,
      10_000n,
      'activity-raffle',
      {
        guildId: 1127255165548888196n,
        metadata: { period: ActivityPeriod.Day },
      },
    );
    expect(userService.findOrCreateMember).toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    const [winnerMessage] = send.mock.calls[1] as unknown as [string];
    expect(winnerMessage.replace(/\u00A0/g, ' ')).toBe(
      `<@42> выиграл 10 000 ${EmojiCoin.Animated}`,
    );
  });

  it('sends the random event template for the raffle announcement', async () => {
    const send = mock(async () => undefined);
    const { guild, guildEventService, service } = createService({
      channel: {
        isSendable: () => true,
        send,
      },
      channelId: '1127255167096586252',
      postMessages: true,
      eventTemplate: '<@42> забирает все монеты!',
      stats: [
        {
          guild_id: 1127255165548888196n,
          message_score: 5,
          reaction_count: 0,
          user_id: 42n,
          voice_seconds: 0,
        },
      ],
    });

    await service.postActivitySummary(guild, ActivityPeriod.Week);

    expect(guildEventService.getRandom).toHaveBeenCalledWith(
      GuildEvents.ACTIVITY_RAFFLE,
      { user: '<@42>', money: expect.stringContaining('100') },
    );
    const [winnerMessage] = send.mock.calls[1] as unknown as [string];
    expect(winnerMessage).toBe('<@42> забирает все монеты!');
  });

  it('does not raffle when the summary was not published', async () => {
    const send = mock(async () => {
      throw new Error('missing access');
    });
    const { guild, service, walletService } = createService({
      channel: {
        isSendable: () => true,
        send,
      },
      channelId: '1127255167096586252',
      postMessages: true,
      stats: [
        {
          guild_id: 1127255165548888196n,
          message_score: 5,
          reaction_count: 0,
          user_id: 42n,
          voice_seconds: 0,
        },
      ],
    });

    await service.postActivitySummary(guild, ActivityPeriod.Month);

    expect(send).toHaveBeenCalledTimes(1);
    expect(walletService.credit).not.toHaveBeenCalled();
  });
});
