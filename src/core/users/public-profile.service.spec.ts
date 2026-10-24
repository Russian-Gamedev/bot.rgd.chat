import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';

import { PermissionService } from '#core/permissions/permissions.service';
import { UserProfileEntity } from './entities/user-profile.entity';
import { PublicProfileService } from './public-profile.service';
import { PublicProfileTagService } from './public-profile-tag.service';
import { UserService } from './users.service';

function createProfile(
  userId: bigint,
  overrides: Partial<UserProfileEntity> = {},
): UserProfileEntity {
  const profile = new UserProfileEntity();
  profile.user_id = userId;
  profile.username = 'alice';
  profile.avatar_url = 'https://cdn.discordapp.com/old.webp';
  profile.banner_color = '#fff';
  profile.firstJoinedAt = new Date('2026-06-01T00:00:00.000Z');
  profile.lastActiveAt = new Date('2026-06-13T00:00:00.000Z');
  Object.assign(profile, overrides);
  return profile;
}

function createCachedResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: '123',
    username: 'alice',
    nickname: null,
    avatarUrl: 'https://cdn.discordapp.com/cached.webp',
    banner: null,
    bannerAlt: null,
    bannerColor: '#fff',
    about: null,
    info: { about: null, links: [] },
    birthDate: null,
    firstJoinedAt: '2026-06-01T00:00:00.000Z',
    lastActiveAt: '2026-06-13T00:00:00.000Z',
    activeStreak: 3,
    maxActiveStreak: 5,
    banCount: 0,
    tags: [],
    ...overrides,
  };
}

describe('PublicProfileService', () => {
  let service: PublicProfileService;
  let userService: UserService;
  let publicProfileTagService: PublicProfileTagService;
  let redis: Redis;

  beforeEach(() => {
    userService = {
      lookupProfile: mock(() => Promise.resolve(null)),
      getProfile: mock(() => Promise.resolve(null)),
    } as unknown as UserService;
    publicProfileTagService = {
      getPublicProfileTags: mock(() => Promise.resolve([])),
    } as unknown as PublicProfileTagService;
    redis = {
      get: mock(() => Promise.resolve(null)),
      set: mock((..._args: unknown[]) => Promise.resolve('OK')),
      del: mock(() => Promise.resolve(1)),
    } as unknown as Redis;
    const permissionService = {
      getActorPermissions: mock(() => Promise.resolve({})),
    } as unknown as PermissionService;

    service = new PublicProfileService(
      userService,
      publicProfileTagService,
      permissionService,
      redis,
    );
  });

  it('returns a cached profile response without looking up the database', async () => {
    (redis.get as ReturnType<typeof mock>).mockResolvedValueOnce(
      JSON.stringify(createCachedResponse()),
    );

    const result = await service.getPublicProfile('123');

    expect(result.avatarUrl).toBe('https://cdn.discordapp.com/cached.webp');
    expect(userService.lookupProfile).not.toHaveBeenCalled();
  });

  it('throws NotFoundException for a cached miss marker', async () => {
    (redis.get as ReturnType<typeof mock>).mockResolvedValueOnce('-');

    await expect(service.getPublicProfile('nobody')).rejects.toThrow(
      NotFoundException,
    );
    expect(userService.lookupProfile).not.toHaveBeenCalled();
  });

  it('throws NotFoundException and caches a miss when the profile is not found', async () => {
    await expect(service.getPublicProfile('nobody')).rejects.toThrow(
      NotFoundException,
    );

    expect(userService.lookupProfile).toHaveBeenCalledWith('nobody');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('users:lookup-profile-response'),
      '-',
      'EX',
      60,
    );
  });

  it('serves the stored profile and caches it on a miss', async () => {
    (
      userService.lookupProfile as ReturnType<typeof mock>
    ).mockResolvedValueOnce(createProfile(123n));

    const result = await service.getPublicProfile('123');

    expect(result.avatarUrl).toBe('https://cdn.discordapp.com/old.webp');
    expect(publicProfileTagService.getPublicProfileTags).toHaveBeenCalledWith(
      123n,
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('users:lookup-profile-response'),
      expect.stringContaining('old.webp'),
      'EX',
      60,
    );
  });
});
