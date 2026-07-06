import { describe, expect, it, mock } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type Redis from 'ioredis';

import { BotEntity } from '#core/bots/entities/bot.entity';
import { PermissionService } from '#core/permissions/permissions.service';
import { ActorType, Permission } from '#core/permissions/permissions.types';
import { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UsersController } from './users.controller';
import type { UserService } from './users.service';

describe('UsersController', () => {
  function createPermissionService() {
    return {
      getActorPermissions: mock(async () => ({ global: [], guilds: {} })),
    } as unknown as PermissionService;
  }

  function createRedis() {
    return {
      get: mock(async () => null),
      set: mock(async () => 'OK'),
      del: mock(async () => 1),
    } as unknown as Redis;
  }

  it('returns public profile by id without internal fields', async () => {
    const profile = createProfile();
    const userService = {
      lookupProfile: mock(async () => profile),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const redis = createRedis();
    const controller = new UsersController(
      userService,
      createPermissionService(),
      redis,
    );

    const expected = {
      id: '123',
      username: 'alice',
      nickname: 'Ali',
      avatarUrl: 'https://cdn.discordapp.com/avatar.webp',
      banner: null,
      bannerAlt: null,
      bannerColor: '#abc',
      about: 'hello',
      info: {
        about: 'hello',
        links: [],
      },
      birthDate: new Date('2000-01-02T00:00:00.000Z'),
      firstJoinedAt: new Date('2026-06-01T00:00:00.000Z'),
      lastActiveAt: new Date('2026-06-13T00:00:00.000Z'),
      activeStreak: 3,
      maxActiveStreak: 5,
      tags: [],
    };

    await expect(controller.getById('123')).resolves.toEqual(expected);
    expect(userService.lookupProfile).toHaveBeenCalledWith('123');
    expect(userService.getPublicProfileTags).toHaveBeenCalledWith(123n);
    expect(redis.set).toHaveBeenCalledWith(
      'users:lookup-profile-response:v5:123',
      JSON.stringify(expected),
      'EX',
      60,
    );
  });

  it('returns public profile by username lookup', async () => {
    const profile = createProfile({ username: 'damirlut' });
    const userService = {
      lookupProfile: mock(async () => profile),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const redis = createRedis();
    const controller = new UsersController(
      userService,
      createPermissionService(),
      redis,
    );

    const result = await controller.getById('DamirLut');

    expect(userService.lookupProfile).toHaveBeenCalledWith('DamirLut');
    expect(result.username).toBe('damirlut');
    expect(redis.set).toHaveBeenCalledWith(
      'users:lookup-profile-response:v5:damirlut',
      JSON.stringify(result),
      'EX',
      60,
    );
  });

  it('returns 404 for unknown public user id', async () => {
    const userService = {
      lookupProfile: mock(async () => null),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const redis = createRedis();
    const controller = new UsersController(
      userService,
      createPermissionService(),
      redis,
    );

    await expect(controller.getById('404')).rejects.toThrow(NotFoundException);
    expect(redis.set).toHaveBeenCalledWith(
      'users:lookup-profile-response:v5:404',
      '-',
      'EX',
      60,
    );
  });

  it('returns cached public profile response without service lookup', async () => {
    const cached = {
      id: '123',
      username: 'alice',
      nickname: 'Ali',
      avatarUrl: 'https://cdn.discordapp.com/avatar.webp',
      banner: null,
      bannerAlt: null,
      bannerColor: '#abc',
      about: 'hello',
      info: {
        about: 'hello',
        links: [],
      },
      birthDate: '2000-01-02T00:00:00.000Z',
      firstJoinedAt: '2026-06-01T00:00:00.000Z',
      lastActiveAt: '2026-06-13T00:00:00.000Z',
      activeStreak: 3,
      maxActiveStreak: 5,
      tags: [],
    };
    const userService = {
      lookupProfile: mock(async () => null),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const redis = createRedis();
    (redis.get as ReturnType<typeof mock>).mockResolvedValueOnce(
      JSON.stringify(cached),
    );
    const controller = new UsersController(
      userService,
      createPermissionService(),
      redis,
    );

    await expect(controller.getById('DamirLut')).resolves.toEqual({
      ...cached,
      birthDate: new Date(cached.birthDate),
      firstJoinedAt: new Date(cached.firstJoinedAt),
      lastActiveAt: new Date(cached.lastActiveAt),
    });
    expect(userService.lookupProfile).not.toHaveBeenCalled();
    expect(userService.getPublicProfileTags).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('returns public profile links inside profile info', async () => {
    const profile = createProfile({
      about: null,
      profileInfo: {
        about: '  profile info  ',
        links: [
          {
            label: ' GitHub ',
            icon: ' github ',
            url: 'https://github.com/alice',
          },
          {
            label: 'invalid',
            icon: 'broken',
            url: 'http://example.com',
          },
          {
            label: 'bad icon',
            icon: 'bad icon',
            url: 'https://example.com',
          },
        ],
      },
    });
    const userService = {
      lookupProfile: mock(async () => profile),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const controller = new UsersController(
      userService,
      createPermissionService(),
      createRedis(),
    );

    const result = await controller.getById('123');

    expect(result.about).toBe('profile info');
    expect(result.info).toEqual({
      about: 'profile info',
      links: [
        {
          label: 'GitHub',
          icon: 'github',
          url: 'https://github.com/alice',
        },
      ],
    });
  });

  it('returns cached public 404 without service lookup', async () => {
    const userService = {
      lookupProfile: mock(async () => createProfile()),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const redis = createRedis();
    (redis.get as ReturnType<typeof mock>).mockResolvedValueOnce('-');
    const controller = new UsersController(
      userService,
      createPermissionService(),
      redis,
    );

    await expect(controller.getById('404')).rejects.toThrow(NotFoundException);
    expect(userService.lookupProfile).not.toHaveBeenCalled();
    expect(userService.getPublicProfileTags).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('returns current user profile for user actor', async () => {
    const profile = createProfile();
    const userService = {
      getProfile: mock(async () => profile),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const permissionService = {
      getActorPermissions: mock(async () => ({
        global: [Permission.WalletReadOwn],
        guilds: {},
      })),
    } as unknown as PermissionService;
    const controller = new UsersController(
      userService,
      permissionService,
      createRedis(),
    );

    const result = await controller.getMe({
      type: ActorType.User,
      id: '123',
      username: 'alice',
    });

    expect(userService.getProfile).toHaveBeenCalledWith('123');
    expect(userService.getPublicProfileTags).toHaveBeenCalledWith(123n);
    expect(permissionService.getActorPermissions).toHaveBeenCalled();
    expect(result.tags).toEqual([]);
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
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const permissionService = {
      getActorPermissions: mock(async () => ({
        global: [Permission.GuildRead],
        guilds: {},
      })),
    } as unknown as PermissionService;
    const controller = new UsersController(
      userService,
      permissionService,
      createRedis(),
    );

    const result = await controller.getMe({
      type: ActorType.Bot,
      id: '1',
      bot,
    });

    expect(userService.getProfile).toHaveBeenCalledWith('999');
    expect(userService.getPublicProfileTags).toHaveBeenCalledWith(999n);
    expect(result.id).toBe('999');
    expect(result.username).toBe('bot-user');
    expect(result.tags).toEqual([]);
    expect(result.permissions).toEqual({
      global: [Permission.GuildRead],
      guilds: {},
    });
  });

  it('updates current user profile information', async () => {
    const updated = createProfile({
      banner_alt: 'https://example.com/banner-alt.png',
      birthDate: new Date('2001-02-03T00:00:00.000Z'),
      profileInfo: {
        about: 'Game developer.',
        links: [
          {
            label: 'GitHub',
            icon: 'github',
            url: 'https://github.com/alice',
          },
        ],
      },
    });
    const dto = {
      bannerAlt: 'https://example.com/banner-alt.png',
      birthDate: new Date('2001-02-03T00:00:00.000Z'),
      info: {
        about: 'Game developer.',
        links: [
          {
            label: 'GitHub',
            icon: 'github',
            url: 'https://github.com/alice',
          },
        ],
      },
    } satisfies PatchCurrentUserProfileDto;
    const userService = {
      updateProfileInfo: mock(async () => updated),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const permissionService = {
      getActorPermissions: mock(async () => ({
        global: [Permission.WalletReadOwn],
        guilds: {},
      })),
    } as unknown as PermissionService;
    const redis = createRedis();
    const controller = new UsersController(
      userService,
      permissionService,
      redis,
    );

    const result = await controller.patchMe(
      {
        type: ActorType.User,
        id: '123',
        username: 'alice',
      },
      dto,
    );

    expect(userService.updateProfileInfo).toHaveBeenCalledWith('123', dto);
    expect(redis.del).toHaveBeenCalledWith(
      'users:lookup-profile-response:v5:123',
      'users:lookup-profile-response:v5:alice',
    );
    expect(result.bannerAlt).toBe('https://example.com/banner-alt.png');
    expect(result.birthDate).toEqual(new Date('2001-02-03T00:00:00.000Z'));
    expect(result.info).toEqual(dto.info);
    expect(result.permissions).toEqual({
      global: [Permission.WalletReadOwn],
      guilds: {},
    });
  });

  it('updates linked bot user profile information', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = 999n;
    const updated = createProfile({ user_id: 999n, username: 'bot-user' });
    const userService = {
      updateProfileInfo: mock(async () => updated),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const permissionService = {
      getActorPermissions: mock(async () => ({
        global: [Permission.GuildRead],
        guilds: {},
      })),
    } as unknown as PermissionService;
    const controller = new UsersController(
      userService,
      permissionService,
      createRedis(),
    );

    const result = await controller.patchMe(
      {
        type: ActorType.Bot,
        id: '1',
        bot,
      },
      { info: { about: 'Bot profile' } },
    );

    expect(userService.updateProfileInfo).toHaveBeenCalledWith('999', {
      info: { about: 'Bot profile' },
    });
    expect(result.id).toBe('999');
  });

  it('returns readable 4xx for bot actor without linked Discord profile id', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = null;
    const userService = {
      getProfile: mock(async () => null),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const controller = new UsersController(
      userService,
      createPermissionService(),
      createRedis(),
    );

    await expect(
      controller.getMe({
        type: ActorType.Bot,
        id: '1',
        bot,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns readable 4xx when unlinked bot tries to update profile', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = null;
    const userService = {
      updateProfileInfo: mock(async () => createProfile()),
      getPublicProfileTags: mock(async () => []),
    } as unknown as UserService;
    const controller = new UsersController(
      userService,
      createPermissionService(),
      createRedis(),
    );

    await expect(
      controller.patchMe(
        {
          type: ActorType.Bot,
          id: '1',
          bot,
        },
        { info: { about: 'Bot profile' } },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(userService.updateProfileInfo).not.toHaveBeenCalled();
  });

  it('validates profile patch input', () => {
    const tooManyLinks = Array.from({ length: 6 }, (_, index) => ({
      label: `Link ${index}`,
      icon: `link_${index}`,
      url: `https://example.com/${index}`,
    }));
    const dto = plainToInstance(PatchCurrentUserProfileDto, {
      bannerAlt: 'http://example.com/banner.png',
      info: {
        about: 'ok',
        links: [
          {
            label: 'Bad icon',
            icon: 'bad icon',
            url: 'https://example.com',
          },
          ...tooManyLinks,
        ],
      },
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
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
  profile.profileInfo = {};
  profile.birthDate = new Date('2000-01-02T00:00:00.000Z');
  profile.firstJoinedAt = new Date('2026-06-01T00:00:00.000Z');
  profile.lastActiveAt = new Date('2026-06-13T00:00:00.000Z');
  profile.activeStreak = 3;
  profile.maxActiveStreak = 5;
  return Object.assign(profile, overrides);
}
