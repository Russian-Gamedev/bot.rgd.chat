import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import Redis from 'ioredis';
import { getActorUserId } from '#core/permissions/actor-user-id';
import { ApiActorAuth } from '#core/permissions/openapi-auth.decorator';
import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { PermissionService } from '#core/permissions/permissions.service';
import { type AuthenticatedActor } from '#core/permissions/permissions.types';

import {
  CurrentUserProfileDto,
  PublicUserProfileDto,
} from './dto/public-user-profile.dto';
import { UserService } from './users.service';

const USER_RESPONSE_CACHE_TTL_SECONDS = 60;
const USER_RESPONSE_CACHE_MISS = '-';
const USER_RESPONSE_CACHE_VERSION = 'v3';
const PUBLIC_USER_PROFILE_DTO_OPTIONS = { excludeExtraneousValues: true };

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

    return {
      ...plainToInstance(
        PublicUserProfileDto,
        { ...profile, tags },
        PUBLIC_USER_PROFILE_DTO_OPTIONS,
      ),
      permissions,
    };
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
        return plainToInstance(
          PublicUserProfileDto,
          JSON.parse(cached) as object,
          PUBLIC_USER_PROFILE_DTO_OPTIONS,
        );
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

    const response = plainToInstance(
      PublicUserProfileDto,
      {
        ...profile,
        tags: await this.userService.getPublicProfileTags(profile.user_id),
      },
      PUBLIC_USER_PROFILE_DTO_OPTIONS,
    );
    await this.redis.set(
      cacheKey,
      JSON.stringify(response),
      'EX',
      USER_RESPONSE_CACHE_TTL_SECONDS,
    );
    return response;
  }
}
