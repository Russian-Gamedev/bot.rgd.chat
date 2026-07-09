import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger, Optional } from '@nestjs/common';

import { MetricsService } from '#common/metrics/metrics.service';
import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { UserService } from '#core/users/users.service';
import { DiscordID } from '#root/lib/types';
import { toMoscowDateKey } from './activity-period';
import { UserActivityDailyEntity } from './entities/user-activity-daily.entity';
import { UserActivityTotalEntity } from './entities/user-activity-total.entity';

export interface ActivityIncrement {
  messageScore?: number;
  voiceSeconds?: number;
  reactionCount?: number;
  at?: Date;
}

export interface ActivityStats {
  user_id: bigint;
  guild_id: bigint | null;
  message_score: number;
  voice_seconds: number;
  reaction_count: number;
}

export type ActivitySortableField =
  | 'message_score'
  | 'voice_seconds'
  | 'reaction_count';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(UserActivityDailyEntity)
    private readonly dailyActivityRepository: EntityRepository<UserActivityDailyEntity>,
    @InjectRepository(UserActivityTotalEntity)
    private readonly totalActivityRepository: EntityRepository<UserActivityTotalEntity>,
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    private readonly em: EntityManager,
    private readonly userService: UserService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async recordActivity(
    guildId: DiscordID,
    userId: DiscordID,
    increment: ActivityIncrement,
  ): Promise<void> {
    const normalizedGuildId = BigInt(guildId);
    const normalizedUserId = BigInt(userId);
    const at = increment.at ?? new Date();
    const messageScore = increment.messageScore ?? 0;
    const voiceSeconds = increment.voiceSeconds ?? 0;
    const reactionCount = increment.reactionCount ?? 0;
    const activityDate = toMoscowDateKey(at);

    this.logger.log(
      `Recording activity for guild ${normalizedGuildId}, user ${normalizedUserId}, date ${activityDate}, at ${at.toISOString()}: messageScore=${messageScore}, voiceSeconds=${voiceSeconds}, reactionCount=${reactionCount}`,
    );

    if (messageScore === 0 && voiceSeconds === 0 && reactionCount === 0) {
      this.logger.log(
        `Skipped activity record for guild ${normalizedGuildId}, user ${normalizedUserId}: zero increment`,
      );
      return;
    }

    await this.userService.findOrCreateMember(
      normalizedGuildId,
      normalizedUserId,
    );

    for (const scopeGuildId of [null, normalizedGuildId]) {
      const daily = await this.getOrCreateDailyActivity(
        normalizedUserId,
        scopeGuildId,
        activityDate,
      );
      const dailyBefore = toActivityLogSnapshot(daily);
      applyActivityIncrement(daily, messageScore, voiceSeconds, reactionCount);
      this.em.persist(daily);

      const total = await this.getOrCreateTotalActivity(
        normalizedUserId,
        scopeGuildId,
      );
      const totalBefore = toActivityLogSnapshot(total);
      applyActivityIncrement(total, messageScore, voiceSeconds, reactionCount);
      total.lastActiveAt = at;
      this.em.persist(total);

      this.logger.log(
        `Applied activity for scope ${formatActivityScope(scopeGuildId)}, user ${normalizedUserId}, date ${activityDate}: daily ${formatActivityLogSnapshot(dailyBefore)} -> ${formatActivityLogSnapshot(daily)}, total ${formatActivityLogSnapshot(totalBefore)} -> ${formatActivityLogSnapshot(total)}, lastActiveAt=${at.toISOString()}`,
      );
    }

    const profile =
      await this.userService.findOrCreateProfile(normalizedUserId);
    profile.lastActiveAt = at;
    this.em.persist(profile);

    await this.em.flush();
    this.recordMetrics(guildId, messageScore, voiceSeconds, reactionCount);
    this.logger.log(
      `Persisted activity for guild ${normalizedGuildId}, user ${normalizedUserId}, date ${activityDate}`,
    );
  }

  async getTopActivityTotals(
    guildId: DiscordID,
    field: ActivitySortableField,
    limit: number,
  ): Promise<UserActivityTotalEntity[]> {
    return this.totalActivityRepository.find(
      { guild_id: BigInt(guildId), [field]: { $gt: 0 } },
      {
        orderBy: { [field]: 'DESC' },
        limit,
      },
    );
  }

  async getGlobalActivityTotal(
    userId: DiscordID,
  ): Promise<UserActivityTotalEntity | null> {
    return this.totalActivityRepository.findOne({
      user_id: BigInt(userId),
      guild_id: null,
    });
  }

  async getGuildActivityTotal(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<UserActivityTotalEntity | null> {
    return this.totalActivityRepository.findOne({
      user_id: BigInt(userId),
      guild_id: BigInt(guildId),
    });
  }

  async getTopMemberStreaks(
    guildId: DiscordID,
    limit: number,
  ): Promise<MemberProfileEntity[]> {
    return this.memberProfileRepository.find(
      { guild_id: BigInt(guildId), activeStreak: { $gt: 0 } },
      {
        orderBy: { activeStreak: 'DESC' },
        limit,
      },
    );
  }

  async getActivityStatsInRange(
    guildId: DiscordID,
    start: string,
    end: string,
  ): Promise<ActivityStats[]> {
    const rows = await this.dailyActivityRepository.find({
      guild_id: BigInt(guildId),
      date: { $gte: start, $lt: end },
    });

    return aggregateActivityRows(rows);
  }

  async increaseMemberStreak(member: MemberProfileEntity): Promise<void> {
    member.activeStreak += 1;
    await this.userService.save(member);
  }

  async resetInactiveMemberStreaks(
    guildId: DiscordID,
    activeUserIds: bigint[],
  ): Promise<void> {
    await this.em.nativeUpdate(
      MemberProfileEntity,
      {
        user_id: { $nin: activeUserIds as unknown as number[] },
        guild_id: BigInt(guildId),
      },
      {
        activeStreak: 0,
      },
    );
  }

  async updateProfileStreaks(activeUserIds: bigint[]): Promise<void> {
    const uniqueActiveUserIds = [...new Set(activeUserIds)];

    if (uniqueActiveUserIds.length > 0) {
      await this.em.nativeUpdate(
        UserProfileEntity,
        {
          user_id: { $nin: uniqueActiveUserIds as unknown as number[] },
        },
        {
          activeStreak: 0,
        },
      );

      for (const userId of uniqueActiveUserIds) {
        const user = await this.userService.findOrCreateProfile(userId);
        user.activeStreak += 1;
        await this.userService.save(user);
      }
      return;
    }

    await this.em.nativeUpdate(UserProfileEntity, {}, { activeStreak: 0 });
  }

  async getInactiveMembers(
    guildId: DiscordID,
    since: Date,
    excludeUserIds: DiscordID[],
  ): Promise<MemberProfileEntity[]> {
    const inactiveTotals = await this.totalActivityRepository.find({
      guild_id: BigInt(guildId),
      lastActiveAt: { $lte: since },
      user_id: { $nin: excludeUserIds.map((id) => BigInt(id)) },
    });
    const inactiveUserIds = inactiveTotals.map((total) => total.user_id);
    if (inactiveUserIds.length === 0) return [];

    return this.memberProfileRepository.find({
      guild_id: BigInt(guildId),
      isLeftGuild: false,
      user_id: { $in: inactiveUserIds },
    });
  }

  private async getOrCreateDailyActivity(
    userId: bigint,
    guildId: bigint | null,
    date: string,
  ) {
    let activity = await this.dailyActivityRepository.findOne({
      date,
      user_id: userId,
      guild_id: guildId,
    });

    if (!activity) {
      activity = new UserActivityDailyEntity();
      activity.date = date;
      activity.user_id = userId;
      activity.guild_id = guildId;
    }

    return activity;
  }

  private recordMetrics(
    guildId: DiscordID,
    messageScore: number,
    voiceSeconds: number,
    reactionCount: number,
  ) {
    this.metrics?.recordActivityIncrement({
      guildId: String(guildId),
      roleSegment: 'unknown',
      kind: 'message',
      amount: messageScore,
    });
    this.metrics?.recordActivityIncrement({
      guildId: String(guildId),
      roleSegment: 'unknown',
      kind: 'voice',
      amount: voiceSeconds,
    });
    this.metrics?.recordActivityIncrement({
      guildId: String(guildId),
      roleSegment: 'unknown',
      kind: 'reaction',
      amount: reactionCount,
    });
  }

  private async getOrCreateTotalActivity(
    userId: bigint,
    guildId: bigint | null,
  ) {
    let activity = await this.totalActivityRepository.findOne({
      user_id: userId,
      guild_id: guildId,
    });

    if (!activity) {
      activity = new UserActivityTotalEntity();
      activity.user_id = userId;
      activity.guild_id = guildId;
    }

    return activity;
  }
}

function applyActivityIncrement(
  target: UserActivityDailyEntity | UserActivityTotalEntity,
  messageScore: number,
  voiceSeconds: number,
  reactionCount: number,
) {
  target.message_score = Math.max(
    0,
    toNumber(target.message_score) + messageScore,
  );
  target.voice_seconds = Math.max(
    0,
    toNumber(target.voice_seconds) + voiceSeconds,
  );
  target.reaction_count = Math.max(
    0,
    toNumber(target.reaction_count) + reactionCount,
  );
}

function aggregateActivityRows(
  rows: UserActivityDailyEntity[],
): ActivityStats[] {
  const stats = new Map<string, ActivityStats>();

  for (const row of rows) {
    const key = row.user_id.toString();
    const current =
      stats.get(key) ??
      ({
        user_id: row.user_id,
        guild_id: row.guild_id,
        message_score: 0,
        voice_seconds: 0,
        reaction_count: 0,
      } satisfies ActivityStats);

    current.message_score += toNumber(row.message_score);
    current.voice_seconds += toNumber(row.voice_seconds);
    current.reaction_count += toNumber(row.reaction_count);
    stats.set(key, current);
  }

  return [...stats.values()];
}

function toNumber(value: number | bigint): number {
  return Number(value);
}

function toActivityLogSnapshot(
  activity: UserActivityDailyEntity | UserActivityTotalEntity,
) {
  return {
    message_score: toNumber(activity.message_score),
    reaction_count: toNumber(activity.reaction_count),
    voice_seconds: toNumber(activity.voice_seconds),
  };
}

function formatActivityLogSnapshot(
  activity:
    | ReturnType<typeof toActivityLogSnapshot>
    | UserActivityDailyEntity
    | UserActivityTotalEntity,
): string {
  return `{messageScore=${toNumber(activity.message_score)}, voiceSeconds=${toNumber(activity.voice_seconds)}, reactionCount=${toNumber(activity.reaction_count)}}`;
}

function formatActivityScope(guildId: bigint | null): string {
  return guildId == null ? 'global' : `guild ${guildId}`;
}
