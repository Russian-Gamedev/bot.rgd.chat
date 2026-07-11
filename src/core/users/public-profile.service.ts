import { Injectable, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';

import { PermissionService } from '#core/permissions/permissions.service';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { DiscordID } from '#root/lib/types';

import { CurrentUserProfileDto } from './dto/current-user-profile.dto';
import { PublicUserProfileDto } from './dto/public-user-profile.dto';
import {
  toCachedPublicUserProfileDto,
  toCurrentUserProfileDto,
  toPublicUserProfileDto,
} from './mappers/public-user-profile.mapper';
import { PublicProfileTagService } from './public-profile-tag.service';
import { UserService } from './users.service';

const USER_RESPONSE_CACHE_TTL_SECONDS = 60;
const USER_RESPONSE_CACHE_MISS = '-';
const USER_RESPONSE_CACHE_VERSION = 'v5';

@Injectable()
export class PublicProfileService {
  constructor(
    private readonly userService: UserService,
    private readonly publicProfileTagService: PublicProfileTagService,
    private readonly permissionService: PermissionService,
    private readonly redis: Redis,
  ) {}

  async getPublicProfile(lookup: string): Promise<PublicUserProfileDto> {
    const normalizedLookup = lookup.trim();
    const isNumericLookup = /^\d+$/.test(normalizedLookup);
    const cacheKey = `users:lookup-profile-response:${USER_RESPONSE_CACHE_VERSION}:${
      isNumericLookup
        ? BigInt(normalizedLookup).toString()
        : normalizedLookup.toLowerCase()
    }`;

    const cached = await this.redis.get(cacheKey);
    if (cached === USER_RESPONSE_CACHE_MISS) {
      throw new NotFoundException('User profile was not found.');
    }
    if (cached) {
      try {
        const response = toCachedPublicUserProfileDto(JSON.parse(cached));
        if (response) return response;

        await this.redis.del(cacheKey);
      } catch {
        await this.redis.del(cacheKey);
      }
    }

    const profile = await this.userService.lookupProfile(lookup);
    if (!profile) {
      await this.redis.set(
        cacheKey,
        USER_RESPONSE_CACHE_MISS,
        'EX',
        USER_RESPONSE_CACHE_TTL_SECONDS,
      );
      throw new NotFoundException('User profile was not found.');
    }

    const tags = await this.publicProfileTagService.getPublicProfileTags(
      profile.user_id,
    );
    const dto = toPublicUserProfileDto(profile, tags);

    await this.redis.set(
      cacheKey,
      JSON.stringify(dto),
      'EX',
      USER_RESPONSE_CACHE_TTL_SECONDS,
    );
    return dto;
  }

  async getCurrentUserProfile(
    userId: DiscordID,
    actor: AuthenticatedActor,
  ): Promise<CurrentUserProfileDto> {
    const profile = await this.userService.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('User profile was not found.');
    }

    const tags = await this.publicProfileTagService.getPublicProfileTags(
      profile.user_id,
    );
    const permissions = await this.permissionService.getActorPermissions(actor);

    return toCurrentUserProfileDto(profile, tags, permissions);
  }

  async invalidateProfileCache(profile: {
    user_id: bigint;
    username: string;
  }): Promise<void> {
    await this.redis.del(
      `users:lookup-profile-response:${USER_RESPONSE_CACHE_VERSION}:${profile.user_id.toString()}`,
      `users:lookup-profile-response:${USER_RESPONSE_CACHE_VERSION}:${profile.username.toLowerCase()}`,
    );
  }
}
