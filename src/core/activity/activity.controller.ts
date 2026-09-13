import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import Redis from 'ioredis';

import { getActorUserId } from '#core/permissions/actor-user-id';
import { Actor } from '#core/permissions/permissions.decorator';
import {
  ActorAuthGuard,
  OptionalActorAuthGuard,
} from '#core/permissions/permissions.guard';
import {
  ActorType,
  type AuthenticatedActor,
} from '#core/permissions/permissions.types';
import { UserService } from '#core/users/users.service';
import { ActivityService } from './activity.service';
import {
  DEFAULT_ACTIVITY_RANGE_MONTHS,
  getActivityRange,
  getRecentDaysRange,
} from './activity-period';
import { ActivityRangeQueryDto } from './dto/activity-range.dto';
import {
  type ActivityOverviewDto,
  type CurrentUserActivityDto,
  type UserActivityDto,
} from './dto/activity-stats.dto';

const OVERVIEW_CACHE_TTL_SECONDS = 5 * 60;
const OVERVIEW_CACHE_VERSION = 'v1';

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly userService: UserService,
    private readonly redis: Redis,
  ) {}

  @Get('me')
  @UseGuards(ActorAuthGuard)
  async getMyActivity(
    @Actor() actor: AuthenticatedActor,
    @Query() query: ActivityRangeQueryDto,
  ): Promise<CurrentUserActivityDto> {
    const userId = getActorUserId(actor);
    const profile = await this.requireProfile(userId);
    const [start, end] = getActivityRange(
      query.months ?? DEFAULT_ACTIVITY_RANGE_MONTHS,
    );

    const [days, totals] = await Promise.all([
      this.activityService.getUserActivityDays(userId, start, end),
      this.activityService.getUserActivityTotals(userId),
    ]);

    return {
      isPublic: profile.activityPublic,
      days,
      totals,
      streak: {
        current: profile.activeStreak,
        max: profile.maxActiveStreak,
      },
    };
  }

  @Get('users/:userId')
  @UseGuards(OptionalActorAuthGuard)
  async getUserActivity(
    @Actor() actor: AuthenticatedActor | null,
    @Param('userId') userId: string,
    @Query() query: ActivityRangeQueryDto,
  ): Promise<UserActivityDto> {
    userId = parseUserId(userId);
    const profile = await this.requireProfile(userId);

    const requesterId =
      actor?.type === ActorType.User ? BigInt(actor.id) : null;
    if (requesterId !== BigInt(userId) && !profile.activityPublic) {
      throw new ForbiddenException('Activity is private.');
    }

    const [start, end] = getActivityRange(
      query.months ?? DEFAULT_ACTIVITY_RANGE_MONTHS,
    );

    const [days, totals] = await Promise.all([
      this.activityService.getUserActivityDays(userId, start, end),
      this.activityService.getUserActivityTotals(userId),
    ]);

    return {
      days,
      totals,
      streak: {
        current: profile.activeStreak,
        max: profile.maxActiveStreak,
      },
    };
  }

  @Get('overview')
  async getOverview(
    @Query() query: ActivityRangeQueryDto,
  ): Promise<ActivityOverviewDto> {
    const months = query.months ?? DEFAULT_ACTIVITY_RANGE_MONTHS;
    const cacheKey = `activity:overview-response:${OVERVIEW_CACHE_VERSION}:${months}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const [start, end] = getActivityRange(months);
    const [weekStart] = getRecentDaysRange(7);

    const [days, totals, activeWeekUsers] = await Promise.all([
      this.activityService.getOverviewActivityDays(start, end),
      this.activityService.getOverviewActivityTotals(),
      this.activityService.getActiveUsersCountSince(weekStart),
    ]);

    const overview: ActivityOverviewDto = {
      days,
      totals,
      activeWeekUsers,
    };
    await this.redis.set(
      cacheKey,
      JSON.stringify(overview),
      'EX',
      OVERVIEW_CACHE_TTL_SECONDS,
    );
    return overview;
  }

  private async requireProfile(userId: string) {
    const profile = await this.userService.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('User profile was not found.');
    }
    return profile;
  }
}

function parseUserId(value: string): string {
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException('Invalid user id.');
  }
  return value;
}
