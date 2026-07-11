import { describe, expect, it, mock } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { BotEntity } from '#core/bots/entities/bot.entity';
import { ActorType } from '#core/permissions/permissions.types';
import type { CurrentUserProfileDto } from './dto/current-user-profile.dto';
import { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import type { PublicUserProfileDto } from './dto/public-user-profile.dto';
import { UserProfileEntity } from './entities/user-profile.entity';
import type { PublicProfileService } from './public-profile.service';
import { UsersController } from './users.controller';
import type { UserService } from './users.service';

describe('UsersController', () => {
  function createPublicProfileService(
    overrides: Partial<PublicProfileService> = {},
  ): PublicProfileService {
    return {
      getPublicProfile: mock(async () => createProfileResponse()),
      getCurrentUserProfile: mock(async () =>
        createCurrentUserProfileResponse(),
      ),
      invalidateProfileCache: mock(async () => undefined),
      ...overrides,
    } as unknown as PublicProfileService;
  }

  function createProfileResponse(
    overrides: Partial<PublicUserProfileDto> = {},
  ): PublicUserProfileDto {
    return {
      id: '123',
      username: 'alice',
      nickname: 'Ali',
      avatarUrl: 'https://cdn.discordapp.com/avatar.webp',
      banner: null,
      bannerAlt: null,
      bannerColor: '#abc',
      about: 'hello',
      info: { about: 'hello', links: [] },
      birthDate: new Date('2000-01-02T00:00:00.000Z'),
      firstJoinedAt: new Date('2026-06-01T00:00:00.000Z'),
      lastActiveAt: new Date('2026-06-13T00:00:00.000Z'),
      activeStreak: 3,
      maxActiveStreak: 5,
      tags: [],
      ...overrides,
    } as PublicUserProfileDto;
  }

  function createCurrentUserProfileResponse(
    overrides: Partial<CurrentUserProfileDto> = {},
  ): CurrentUserProfileDto {
    return {
      ...createProfileResponse(),
      permissions: { global: [], guilds: {} },
      ...overrides,
    } as CurrentUserProfileDto;
  }

  function createUserService(
    overrides: Partial<UserService> = {},
  ): UserService {
    return {
      updateProfileInfo: mock(async () => createProfile()),
      ...overrides,
    } as unknown as UserService;
  }

  it('returns public profile by id', async () => {
    const expected = createProfileResponse();
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () => expected),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
    );

    const result = await controller.getById('123');

    expect(result).toEqual(expected);
    expect(publicProfileService.getPublicProfile).toHaveBeenCalledWith('123');
  });

  it('returns public profile by username lookup', async () => {
    const expected = createProfileResponse({ username: 'damirlut' });
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () => expected),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
    );

    const result = await controller.getById('DamirLut');

    expect(result.username).toBe('damirlut');
    expect(publicProfileService.getPublicProfile).toHaveBeenCalledWith(
      'DamirLut',
    );
  });

  it('throws NotFoundException when public profile is not found', async () => {
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () => {
        throw new NotFoundException('User profile was not found.');
      }),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
    );

    await expect(controller.getById('404')).rejects.toThrow(NotFoundException);
  });

  it('returns current user profile for user actor', async () => {
    const expected = createCurrentUserProfileResponse({
      permissions: { global: [], guilds: {} },
    });
    const publicProfileService = createPublicProfileService({
      getCurrentUserProfile: mock(async () => expected),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
    );

    const result = await controller.getMe({
      type: ActorType.User,
      id: '123',
      username: 'alice',
    });

    expect(result.tags).toEqual([]);
    expect(result.permissions).toEqual({ global: [], guilds: {} });
    expect(publicProfileService.getCurrentUserProfile).toHaveBeenCalledWith(
      '123',
      { type: ActorType.User, id: '123', username: 'alice' },
    );
  });

  it('returns linked Discord bot profile for bot actor', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = 999n;
    const expected = createCurrentUserProfileResponse({
      id: '999',
      username: 'bot-user',
    });
    const publicProfileService = createPublicProfileService({
      getCurrentUserProfile: mock(async () => expected),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
    );

    const result = await controller.getMe({
      type: ActorType.Bot,
      id: '1',
      bot,
    });

    expect(result.id).toBe('999');
    expect(result.username).toBe('bot-user');
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
    const userService = createUserService({
      updateProfileInfo: mock(async () => updated),
    });
    const expected = createCurrentUserProfileResponse({
      bannerAlt: 'https://example.com/banner-alt.png',
      birthDate: new Date('2001-02-03T00:00:00.000Z'),
      info: dto.info,
    });
    const publicProfileService = createPublicProfileService({
      getCurrentUserProfile: mock(async () => expected),
    });
    const controller = new UsersController(userService, publicProfileService);

    const result = await controller.patchMe(
      {
        type: ActorType.User,
        id: '123',
        username: 'alice',
      },
      dto,
    );

    expect(userService.updateProfileInfo).toHaveBeenCalledWith('123', dto);
    expect(publicProfileService.invalidateProfileCache).toHaveBeenCalledWith(
      updated,
    );
    expect(result.bannerAlt).toBe('https://example.com/banner-alt.png');
    expect(result.birthDate).toEqual(new Date('2001-02-03T00:00:00.000Z'));
    expect(result.info).toEqual(dto.info);
  });

  it('updates linked bot user profile information', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.botUserId = 999n;
    const updated = createProfile({ user_id: 999n, username: 'bot-user' });
    const userService = createUserService({
      updateProfileInfo: mock(async () => updated),
    });
    const expected = createCurrentUserProfileResponse({ id: '999' });
    const publicProfileService = createPublicProfileService({
      getCurrentUserProfile: mock(async () => expected),
    });
    const controller = new UsersController(userService, publicProfileService);

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
    const publicProfileService = createPublicProfileService({
      getCurrentUserProfile: mock(async () => {
        throw new BadRequestException(
          'Bot token is not linked to a Discord profile.',
        );
      }),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
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
    const userService = createUserService();
    const publicProfileService = createPublicProfileService({
      getCurrentUserProfile: mock(async () => {
        throw new BadRequestException(
          'Bot token is not linked to a Discord profile.',
        );
      }),
    });
    const controller = new UsersController(userService, publicProfileService);

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
