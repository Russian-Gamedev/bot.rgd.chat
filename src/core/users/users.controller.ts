import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import Redis from 'ioredis';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { PermissionService } from '#core/permissions/permissions.service';
import { type AuthenticatedActor } from '#core/permissions/permissions.types';

import { CurrentUserProfileDto } from './dto/current-user-profile.dto';
import { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import { PublicUserProfileDto } from './dto/public-user-profile.dto';
import {
  toCachedPublicUserProfileDto,
  toCurrentUserProfileDto,
  toPublicUserProfileDto,
} from './mappers/public-user-profile.mapper';
import { UserService } from './users.service';

const USER_RESPONSE_CACHE_TTL_SECONDS = 60;
const USER_RESPONSE_CACHE_MISS = '-';
const USER_RESPONSE_CACHE_VERSION = 'v5';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly permissionService: PermissionService,
    private readonly redis: Redis,
  ) {}

  @Get('me')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Get current user profile and permissions',
    description:
      'Accepts a user JWT from cookie/header or a linked bot bearer token. Unlinked bot tokens are rejected.',
  })
  @ApiOkResponse({ type: CurrentUserProfileDto })
  @ApiBadRequestResponse({
    description: 'Bot token is not linked to a Discord profile.',
  })
  @ApiNotFoundResponse({ description: 'User profile was not found.' })
  async getMe(@Actor() actor: AuthenticatedActor) {
    const userId = getActorUserId(actor);
    const profile = await this.userService.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('User profile was not found.');
    }

    const permissions = await this.permissionService.getActorPermissions(actor);
    const tags = await this.userService.getPublicProfileTags(profile.user_id);

    return toCurrentUserProfileDto(profile, tags, permissions);
  }

  @Patch('me')
  @UseGuards(ActorAuthGuard)
  @ApiActorAuth()
  @ApiOperation({
    summary: 'Update current user profile information',
    description:
      'Accepts a user JWT from cookie/header or a linked bot bearer token. Missing fields are preserved; null clears nullable fields.',
  })
  @ApiBody({ type: PatchCurrentUserProfileDto })
  @ApiOkResponse({ type: CurrentUserProfileDto })
  @ApiBadRequestResponse({
    description: 'Bot token is not linked to a Discord profile.',
  })
  async patchMe(
    @Actor() actor: AuthenticatedActor,
    @Body() dto: PatchCurrentUserProfileDto,
  ): Promise<CurrentUserProfileDto> {
    const userId = getActorUserId(actor);
    const profile = await this.userService.updateProfileInfo(userId, dto);
    await this.invalidatePublicProfileCache(profile);

    const permissions = await this.permissionService.getActorPermissions(actor);
    const tags = await this.userService.getPublicProfileTags(profile.user_id);

    return toCurrentUserProfileDto(profile, tags, permissions);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get public user profile',
    description: 'Looks up a user profile by Discord ID or username.',
  })
  @ApiParam({
    name: 'id',
    description: 'Discord user ID or username.',
    example: '123456789012345678',
  })
  @ApiOkResponse({ type: PublicUserProfileDto })
  @ApiNotFoundResponse({ description: 'User profile was not found.' })
  async getById(@Param('id') id: string): Promise<PublicUserProfileDto> {
    const normalizedLookup = id.trim();
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

    const profile = await this.userService.lookupProfile(id);
    if (!profile) {
      await this.redis.set(
        cacheKey,
        USER_RESPONSE_CACHE_MISS,
        'EX',
        USER_RESPONSE_CACHE_TTL_SECONDS,
      );
      throw new NotFoundException('User profile was not found.');
    }

    const response = toPublicUserProfileDto(
      profile,
      await this.userService.getPublicProfileTags(profile.user_id),
    );
    await this.redis.set(
      cacheKey,
      JSON.stringify(response),
      'EX',
      USER_RESPONSE_CACHE_TTL_SECONDS,
    );
    return response;
  }

  private async invalidatePublicProfileCache(profile: {
    user_id: bigint;
    username: string;
  }): Promise<void> {
    await this.redis.del(
      `users:lookup-profile-response:${USER_RESPONSE_CACHE_VERSION}:${profile.user_id.toString()}`,
      `users:lookup-profile-response:${USER_RESPONSE_CACHE_VERSION}:${profile.username.toLowerCase()}`,
    );
  }
}
