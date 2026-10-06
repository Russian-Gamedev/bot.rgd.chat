import { raw, UniqueConstraintViolationException } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger, Optional } from '@nestjs/common';

import { MetricsService } from '#common/metrics/metrics.service';
import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { UserService } from '#core/users/users.service';
import type { DiscordID } from '#root/lib/types';
import { toMoscowDateKey } from './activity-period';
import {
  type ActivityDayDto,
  type ActivityOverviewDayDto,
  type ActivityTotalsDto,
} from './dto/activity-stats.dto';
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

    this.logger.debug(
      `Recording activity for guild ${normalizedGuildId}, user ${normalizedUserId}, date ${activityDate}, at ${at.toISOString()}: messageScore=${messageScore}, voiceSeconds=${voiceSeconds}, reactionCount=${reactionCount}`,
    );

    if (messageScore === 0 && voiceSeconds === 0 && reactionCount === 0) {
      this.logger.log(
        `Skipped activity record for guild ${normalizedGuildId}, user ${normalizedUserId}: zero increment`,
      );
      return;
    }

    const member = await this.userService.findOrCreateMember(
      normalizedGuildId,
      normalizedUserId,
    );

    for (const scopeGuildId of [null, normalizedGuildId]) {
      const where = {
        user_id: normalizedUserId,
        guild_id: scopeGuildId,
      };
      const increment = {
        message_score: messageScore,
        voice_seconds: voiceSeconds,
        reaction_count: reactionCount,
      };

      await this.upsertActivity(
        UserActivityDailyEntity,
        { ...where, date: activityDate },
        increment,
      );
      await this.upsertActivity(UserActivityTotalEntity, where, increment);
    }

    member.lastActiveAt = at;
    await this.userService.save(member);

    const profile =
      await this.userService.findOrCreateProfile(normalizedUserId);
    profile.lastActiveAt = at;
    await this.userService.save(profile);
    this.recordMetrics(guildId, messageScore, voiceSeconds, reactionCount);
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

  async getUserActivityDays(
    userId: DiscordID,
    start: string,
    end: string,
  ): Promise<ActivityDayDto[]> {
    const rows = await this.dailyActivityRepository.find({
      user_id: BigInt(userId),
      guild_id: null,
      date: { $gte: start, $lt: end },
    });

    return rows
      .map(toActivityDay)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async getUserActivityTotals(userId: DiscordID): Promise<ActivityTotalsDto> {
    return toActivityTotals(await this.getGlobalActivityTotal(userId));
  }

  async getOverviewActivityDays(
    start: string,
    end: string,
  ): Promise<ActivityOverviewDayDto[]> {
    interface OverviewRow {
      date: string;
      message_score: number | string | bigint;
      voice_seconds: number | string | bigint;
      reaction_count: number | string | bigint;
      active_users: number | string | bigint;
    }

    const rows: OverviewRow[] = await this.dailyActivityRepository
      .createQueryBuilder('a')
      .select([
        'a.date',
        raw('sum(a.message_score)').as('message_score'),
        raw('sum(a.voice_seconds)').as('voice_seconds'),
        raw('sum(a.reaction_count)').as('reaction_count'),
        raw('count(distinct a.user_id)').as('active_users'),
      ])
      .where({ guild_id: null, date: { $gte: start, $lt: end } })
      .groupBy('a.date')
      .orderBy({ 'a.date': 'asc' })
      .execute();

    return rows.map((row) => ({
      ...toActivityDay(row),
      activeUsers: Number(row.active_users),
    }));
  }

  async getOverviewActivityTotals(): Promise<ActivityTotalsDto> {
    const row = await this.totalActivityRepository
      .createQueryBuilder('t')
      .select([
        raw('coalesce(sum(t.message_score), 0)').as('message_score'),
        raw('coalesce(sum(t.voice_seconds), 0)').as('voice_seconds'),
        raw('coalesce(sum(t.reaction_count), 0)').as('reaction_count'),
      ])
      .where({ guild_id: null })
      .execute('get');

    return toActivityTotals(row as UserActivityTotalEntity | null);
  }

  async getActiveUsersCountSince(start: string): Promise<number> {
    const row = await this.dailyActivityRepository
      .createQueryBuilder('a')
      .select([raw('count(distinct a.user_id)').as('active_users')])
      .where({ guild_id: null, date: { $gte: start } })
      .execute('get');

    return Number(
      (row as { active_users?: number | string } | null)?.active_users ?? 0,
    );
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
    return this.memberProfileRepository.find({
      guild_id: BigInt(guildId),
      isLeftGuild: false,
      lastActiveAt: { $lte: since },
      user_id: { $nin: excludeUserIds.map((id) => BigInt(id)) },
    });
  }

  private async tryInsert(
    entity: typeof UserActivityDailyEntity | typeof UserActivityTotalEntity,
    where: Record<string, unknown>,
    data: Record<string, unknown>,
    increment: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.em.insert(
        entity as typeof UserActivityDailyEntity,
        {
          ...where,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as UserActivityDailyEntity,
      );
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        await this.em.nativeUpdate(
          entity as typeof UserActivityDailyEntity,
          where,
          increment,
        );
      } else {
        throw error;
      }
    }
  }

  private async upsertActivity(
    entity: typeof UserActivityDailyEntity | typeof UserActivityTotalEntity,
    where: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<void> {
    const increment = buildIncrement(data, INCREMENT_FIELDS);
    const affected = await this.em.nativeUpdate(
      entity as typeof UserActivityDailyEntity,
      where,
      increment,
    );
    if (affected === 0) {
      await this.tryInsert(entity, where, data, increment);
    }
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

function toNumber(value: number | bigint | string): number {
  return Number(value);
}

function toActivityDay(row: {
  date: string;
  message_score: number | bigint | string;
  voice_seconds: number | bigint | string;
  reaction_count: number | bigint | string;
}): ActivityDayDto {
  return {
    date: row.date,
    messageScore: toNumber(row.message_score),
    voiceSeconds: toNumber(row.voice_seconds),
    reactionCount: toNumber(row.reaction_count),
  };
}

function toActivityTotals(
  totals: UserActivityTotalEntity | null,
): ActivityTotalsDto {
  return {
    messageScore: totals ? toNumber(totals.message_score) : 0,
    voiceSeconds: totals ? toNumber(totals.voice_seconds) : 0,
    reactionCount: totals ? toNumber(totals.reaction_count) : 0,
  };
}

const INCREMENT_FIELDS = [
  'message_score',
  'voice_seconds',
  'reaction_count',
] as const;

function buildIncrement(
  data: Record<string, unknown>,
  incrementFields: readonly string[],
): Record<string, unknown> {
  const increment: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    increment[key] = incrementFields.includes(key)
      ? raw(`${key} + ?`, [value])
      : value;
  }
  return increment;
}
