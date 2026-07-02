import { describe, expect, it, mock } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';

import { BotEntity } from '#core/bots/entities/bot.entity';
import { PermissionService } from '#core/permissions/permissions.service';
import { ActorType, Permission } from '#core/permissions/permissions.types';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UsersController } from './users.controller';
import type { UserService } from './users.service';

describe('UsersController', () => {
  function createPermissionService() {
    return {
      getActorPermissions: mock(async () => ({ global: [], guilds: {} })),
    } as unknown as PermissionService;
  }

  it('returns public profile by id without internal fields', async () => {
    const profile = createProfile();
    const userService = {
      getProfile: mock(async () => profile),
    } as unknown as UserService;
    const controller = new UsersController(
      userService,
      createPermissionService(),
    );

    await expect(controller.getById('123')).resolves.toEqual({
      id: '123',
      username: 'alice',
      nickname: 'Ali',
      avatar_url: 'https://cdn.discordapp.com/avatar.webp',
      banner: null,
      banner_alt: null,
      banner_color: '#abc',
      about: 'hello',
      birth_date: new Date('2000-01-02T00:00:00.000Z'),
      first_joined_at: new Date('2026-06-01T00:00:00.000Z'),
      last_active_at: new Date('2026-06-13T00:00:00.000Z'),
      active_streak: 3,
      max_active_streak: 5,
    });
    expect(userService.getProfile).toHaveBeenCalledWith('123');
  });

  it('returns 404 for unknown public user id', async () => {
    const userService = {
      getProfile: mock(async () => null),
    } as unknown as UserService;
    const controller = new UsersController(
      userService,
      createPermissionService(),
    );

    await expect(controller.getById('404')).rejects.toThrow(NotFoundException);
  });

  it('returns current user profile for user actor', async () => {
    const profile = createProfile();
    const userService = {
      getProfile: mock(async () => profile),
    } as unknown as UserService;
    const permissionService = {
      getActorPermissions: mock(async () => ({
        global: [Permission.WalletReadOwn],
        guilds: {},
      })),
    } as unknown as PermissionService;
    const controller = new UsersController(userService, permissionService);

    const result = await controller.getMe({
      type: ActorType.User,
      id: '123',
      username: 'alice',
    });

    expect(userService.getProfile).toHaveBeenCalledWith('123');
    expect(permissionService.getActorPermissions).toHaveBeenCalled();
    expect(result.permissions).toEqual({
      global: [Permission.WalletReadOwn],
      guilds: {},
    });
  });

  it('returns linked Discord bot profile for bot actor', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = 999n;
    const profile = createProfile({ user_id: 999n, username: 'bot-user' });
    const userService = {
      getProfile: mock(async () => profile),
    } as unknown as UserService;
    const permissionService = {
      getActorPermissions: mock(async () => ({
        global: [Permission.GuildRead],
        guilds: {},
      })),
    } as unknown as PermissionService;
    const controller = new UsersController(userService, permissionService);

    const result = await controller.getMe({
      type: ActorType.Bot,
      id: '1',
      bot,
    });

    expect(userService.getProfile).toHaveBeenCalledWith(999n);
    expect(result.id).toBe('999');
    expect(result.username).toBe('bot-user');
    expect(result.permissions).toEqual({
      global: [Permission.GuildRead],
      guilds: {},
    });
  });

  it('returns readable 4xx for bot actor without linked Discord profile id', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = null;
    const userService = {
      getProfile: mock(async () => null),
    } as unknown as UserService;
    const controller = new UsersController(
      userService,
      createPermissionService(),
    );

    await expect(
      controller.getMe({
        type: ActorType.Bot,
        id: '1',
        bot,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

function createProfile(
  overrides: Partial<UserProfileEntity> = {},
): UserProfileEntity {
  const profile = new UserProfileEntity();
  profile.user_id = 123n;
  profile.username = 'alice';
  profile.nickname = 'Ali';
  profile.avatar_url = 'https://cdn.discordapp.com/avatar.webp';
  profile.banner = null;
  profile.banner_alt = null;
  profile.banner_color = '#abc';
  profile.about = 'hello';
  profile.birthDate = new Date('2000-01-02T00:00:00.000Z');
  profile.firstJoinedAt = new Date('2026-06-01T00:00:00.000Z');
  profile.lastActiveAt = new Date('2026-06-13T00:00:00.000Z');
  profile.activeStreak = 3;
  profile.maxActiveStreak = 5;
  return Object.assign(profile, overrides);
}
