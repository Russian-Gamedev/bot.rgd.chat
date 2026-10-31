import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';

import { MetricsService } from '#common/metrics/metrics.service';
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
  let metrics: MetricsService;

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
    metrics = {
      recordProfileCacheLookup: mock(() => undefined),
      recordProfileLookupNotFound: mock(() => undefined),
    } as unknown as MetricsService;

    service = new PublicProfileService(
      userService,
      publicProfileTagService,
      permissionService,
      redis,
      metrics,
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
    expect(metrics.recordProfileLookupNotFound).toHaveBeenCalledWith(
      'username',
    );
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('users:lookup-profile-response'),
      '-',
      'EX',
      60,
    );
  });

  it('records an id lookup when a numeric profile is missing', async () => {
    await expect(service.getPublicProfile(' 999 ')).rejects.toThrow(
      NotFoundException,
    );

    expect(userService.lookupProfile).toHaveBeenCalledWith('999');
    expect(metrics.recordProfileLookupNotFound).toHaveBeenCalledWith('id');
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
      300,
    );
  });

  it('coalesces concurrent lookups for the same profile', async () => {
    let releaseRedis!: (value: string | null) => void;
    (redis.get as ReturnType<typeof mock>).mockImplementationOnce(
      () =>
        new Promise<string | null>((resolve) => {
          releaseRedis = resolve;
        }),
    );
    let resolveLookup!: (value: UserProfileEntity) => void;
    (
      userService.lookupProfile as ReturnType<typeof mock>
    ).mockImplementationOnce(
      () =>
        new Promise<UserProfileEntity>((resolve) => {
          resolveLookup = resolve;
        }),
    );

    const first = service.getPublicProfile('123');
    const second = service.getPublicProfile('123');

    expect(redis.get).toHaveBeenCalledTimes(1);

    releaseRedis(null);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(userService.lookupProfile).toHaveBeenCalledTimes(1);

    resolveLookup(createProfile(123n));

    const [firstProfile, secondProfile] = await Promise.all([first, second]);
    expect(firstProfile).toEqual(secondProfile);
    expect(userService.lookupProfile).toHaveBeenCalledTimes(1);
  });
});
