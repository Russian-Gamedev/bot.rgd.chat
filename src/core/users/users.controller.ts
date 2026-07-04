import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import Redis from 'ioredis';

import { Actor } from '#core/permissions/permissions.decorator';
import { ActorAuthGuard } from '#core/permissions/permissions.guard';
import { PermissionService } from '#core/permissions/permissions.service';
import {
  ActorType,
  type AuthenticatedActor,
} from '#core/permissions/permissions.types';

import { PublicUserProfileDto } from './dto/public-user-profile.dto';
import { UserService } from './users.service';

const USER_RESPONSE_CACHE_TTL_SECONDS = 60;
const USER_RESPONSE_CACHE_MISS = '-';
const PUBLIC_USER_PROFILE_DTO_OPTIONS = { excludeExtraneousValues: true };

@Controller('users')
export class UsersController {
  constructor(
    private readonly userService: UserService,
    private readonly permissionService: PermissionService,
    private readonly redis: Redis,
  ) {}

  @Get('me')
  @UseGuards(ActorAuthGuard)
  async getMe(@Actor() actor: AuthenticatedActor) {
    if (actor.type === ActorType.Bot && !actor.bot.botUserId) {
      throw new BadRequestException(
        'Bot token is not linked to a Discord profile.',
      );
    }

    const userId =
      actor.type === ActorType.User ? actor.id : actor.bot.botUserId!;
    const profile = await this.userService.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('User profile was not found.');
    }

    const permissions = await this.permissionService.getActorPermissions(actor);

    return {
      ...plainToInstance(
        PublicUserProfileDto,
        profile,
        PUBLIC_USER_PROFILE_DTO_OPTIONS,
      ),
      permissions,
    };
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<PublicUserProfileDto> {
    const normalizedLookup = id.trim();
    const isNumericLookup = /^\d+$/.test(normalizedLookup);
    const cacheKey = `users:lookup-profile-response:v1:${
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
      profile,
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
