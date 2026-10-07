import { describe, expect, it, mock } from 'bun:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { type Response } from 'express';

import { BotEntity } from '#core/bots/entities/bot.entity';
import { ActorType } from '#core/permissions/permissions.types';
import { ProjectListQueryDto } from '#core/projects/dto/projects.dto';
import type { ProjectsService } from '#core/projects/projects.service';
import type { CurrentUserProfileDto } from './dto/current-user-profile.dto';
import { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import type { PublicUserProfileDto } from './dto/public-user-profile.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
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
      banCount: 0,
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

  function createProjectsService(
    overrides: Partial<ProjectsService> = {},
  ): ProjectsService {
    return {
      listByUser: mock(async () => ({
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
      })),
      ...overrides,
    } as unknown as ProjectsService;
  }

  it('returns public profile by id', async () => {
    const expected = createProfileResponse();
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () => expected),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
      createProjectsService(),
    );
    const json = mock(() => undefined);
    const res = { json } as unknown as Response;

    await controller.getById('123', res);

    expect(json).toHaveBeenCalledWith(expected);
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
      createProjectsService(),
    );
    const json = mock(() => undefined);
    const res = { json } as unknown as Response;

    await controller.getById('DamirLut', res);

    expect(json).toHaveBeenCalledWith(expected);
    expect(publicProfileService.getPublicProfile).toHaveBeenCalledWith(
      'DamirLut',
    );
  });

  it('treats a non-image extension as a username lookup', async () => {
    const expected = createProfileResponse({ username: '1.5k' });
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () => expected),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
      createProjectsService(),
    );
    const json = mock(() => undefined);
    const res = { json } as unknown as Response;

    await controller.getById('1.5k', res);

    expect(json).toHaveBeenCalledWith(expected);
    expect(publicProfileService.getPublicProfile).toHaveBeenCalledWith('1.5k');
  });

  it('redirects to avatar URL with requested extension', async () => {
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () =>
        createProfileResponse({
          avatarUrl:
            'https://cdn.discordapp.com/avatars/123/hash.webp?size=1024',
        }),
      ),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
      createProjectsService(),
    );
    const redirect = mock(() => undefined);
    const res = { redirect } as unknown as Response;

    await controller.getById('123.png', res);

    expect(publicProfileService.getPublicProfile).toHaveBeenCalledWith('123');
    expect(redirect).toHaveBeenCalledWith(
      308,
      'https://cdn.discordapp.com/avatars/123/hash.png?size=1024',
    );
  });

  it('redirects to avatar URL for dotted username with image extension', async () => {
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () =>
        createProfileResponse({
          avatarUrl:
            'https://cdn.discordapp.com/avatars/123/hash.webp?size=1024',
        }),
      ),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
      createProjectsService(),
    );
    const redirect = mock(() => undefined);
    const res = { redirect } as unknown as Response;

    await controller.getById('damirlut.dev.png', res);

    expect(publicProfileService.getPublicProfile).toHaveBeenCalledWith(
      'damirlut.dev',
    );
    expect(redirect).toHaveBeenCalledWith(
      308,
      'https://cdn.discordapp.com/avatars/123/hash.png?size=1024',
    );
  });

  it('throws NotFoundException when avatar profile is not found', async () => {
    const publicProfileService = createPublicProfileService({
      getPublicProfile: mock(async () => {
        throw new NotFoundException('User profile was not found.');
      }),
    });
    const controller = new UsersController(
      createUserService(),
      publicProfileService,
      createProjectsService(),
    );

    await expect(controller.getById('404.png', {} as Response)).rejects.toThrow(
      NotFoundException,
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
      createProjectsService(),
    );

    await expect(controller.getById('404', {} as Response)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns published projects using the resolved profile id', async () => {
    const userService = createUserService({
      lookupProfile: mock(async () => createProfile({ user_id: 456n })),
    });
    const projectsService = createProjectsService();
    const controller = new UsersController(
      userService,
      createPublicProfileService(),
      projectsService,
    );
    const query = plainToInstance(ProjectListQueryDto, {
      limit: 10,
      offset: 5,
    });

    const result = await controller.getProjects('Alice', query);

    expect(userService.lookupProfile).toHaveBeenCalledWith('Alice');
    expect(projectsService.listByUser).toHaveBeenCalledWith('456', query);
    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it('returns 404 for projects when the user lookup does not resolve', async () => {
    const projectsService = createProjectsService();
    const controller = new UsersController(
      createUserService({ lookupProfile: mock(async () => null) }),
      createPublicProfileService(),
      projectsService,
    );

    await expect(
      controller.getProjects(
        'missing',
        plainToInstance(ProjectListQueryDto, {}),
      ),
    ).rejects.toThrow(NotFoundException);
    expect(projectsService.listByUser).not.toHaveBeenCalled();
  });

  it('searches users by query and returns the results', async () => {
    const expected = [
      {
        id: '123',
        username: 'Damir',
        nickname: null,
        avatarUrl: 'https://cdn.discordapp.com/a.png',
      },
    ];
    const userService = createUserService({
      searchProfiles: mock(async () => expected),
    });
    const controller = new UsersController(
      userService,
      createPublicProfileService(),
      createProjectsService(),
    );

    const result = await controller.search(
      plainToInstance(UserSearchQueryDto, { q: '  Dam ' }),
    );

    expect(userService.searchProfiles).toHaveBeenCalledWith('Dam');
    expect(result).toBe(expected);
  });

  it('validates search query length', () => {
    const query = plainToInstance(UserSearchQueryDto, { q: ' д ' });

    expect(validateSync(query).length).toBeGreaterThan(0);
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
      createProjectsService(),
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
      createProjectsService(),
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
        about: 'Project developer.',
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
        about: 'Project developer.',
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
    const controller = new UsersController(
      userService,
      publicProfileService,
      createProjectsService(),
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
    const controller = new UsersController(
      userService,
      publicProfileService,
      createProjectsService(),
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
      createProjectsService(),
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
    const controller = new UsersController(
      userService,
      publicProfileService,
      createProjectsService(),
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
  profile.banCount = 0;
  return Object.assign(profile, overrides);
}
