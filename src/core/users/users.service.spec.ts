import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { BadRequestException } from '@nestjs/common';
import type { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserService } from './users.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: EntityRepository<UserProfileEntity>;
  let memberProfileRepository: EntityRepository<MemberProfileEntity>;
  let em: EntityManager;
  let discordProfileSync: DiscordProfileSyncService;

  beforeEach(() => {
    userRepository = {
      find: mock(() => Promise.resolve([])),
      findOne: mock(() => Promise.resolve(null)),
      createQueryBuilder: mock(() => createQueryBuilderMock()),
      nativeUpdate: mock(() => Promise.resolve(1)),
    } as unknown as EntityRepository<UserProfileEntity>;
    memberProfileRepository = {
      find: mock(() => Promise.resolve([])),
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<MemberProfileEntity>;
    em = {
      persist: mock(() => em),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;
    discordProfileSync = {
      ensureUserProfile: mock(async (userId: bigint) => {
        const user = new UserProfileEntity();
        user.user_id = BigInt(userId);
        return user;
      }),
      ensureMemberProfile: mock(async (guildId: bigint, userId: bigint) => {
        const member = new MemberProfileEntity();
        member.guild_id = BigInt(guildId);
        member.user_id = BigInt(userId);
        return { member, created: true };
      }),
      syncGuildMemberById: mock(() => Promise.resolve(null)),
      syncUserById: mock(async (userId: bigint) => {
        const user = new UserProfileEntity();
        user.user_id = BigInt(userId);
        user.username = 'synced';
        return user;
      }),
    } as unknown as DiscordProfileSyncService;

    service = new UserService(
      userRepository,
      memberProfileRepository,
      em,
      discordProfileSync,
    );
  });

  it('creates both global user and guild membership via atomic ensure helpers', async () => {
    const user = await service.findOrCreateMember(456n, 123n);

    expect(user.user_id).toBe(123n);
    expect(user.guild_id).toBe(456n);
    expect(discordProfileSync.ensureMemberProfile).toHaveBeenCalledWith(
      456n,
      123n,
    );
    expect(discordProfileSync.syncGuildMemberById).toHaveBeenCalledWith(
      456n,
      123n,
    );
  });

  it('syncs existing member when the global avatar is still the default avatar', async () => {
    const existingMember = new MemberProfileEntity();
    existingMember.user_id = 123n;
    existingMember.guild_id = 456n;
    (
      discordProfileSync.ensureMemberProfile as ReturnType<typeof mock>
    ).mockResolvedValueOnce({ member: existingMember, created: false });
    const profile = new UserProfileEntity();
    profile.user_id = 123n;
    profile.avatar_url = 'https://cdn.discordapp.com/embed/avatars/1.png';
    (userRepository.findOne as ReturnType<typeof mock>).mockResolvedValue(
      profile,
    );

    await service.findOrCreateMember(456n, 123n);

    expect(discordProfileSync.syncGuildMemberById).toHaveBeenCalledWith(
      456n,
      123n,
    );
  });

  it('does not hide invalid experience amounts', async () => {
    const member = new MemberProfileEntity();
    member.user_id = 123n;

    await expect(service.addExperience(member, Number.NaN)).rejects.toThrow(
      BadRequestException,
    );
    expect(userRepository.nativeUpdate).not.toHaveBeenCalled();
  });

  it('does not hide invalid reputation amounts', async () => {
    const member = new MemberProfileEntity();
    member.user_id = 123n;

    await expect(service.addReputation(member, 1.5)).rejects.toThrow(
      BadRequestException,
    );
    expect(userRepository.nativeUpdate).not.toHaveBeenCalled();
  });

  it('finds public profiles by numeric user id lookup', async () => {
    await service.lookupProfile('123');

    expect(userRepository.findOne).toHaveBeenCalledWith({ user_id: 123n });
    expect(userRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('finds public profiles by username or nickname without case sensitivity', async () => {
    const profile = new UserProfileEntity();
    profile.user_id = 123n;
    const qb = createQueryBuilderMock([profile]);
    (
      userRepository.createQueryBuilder as ReturnType<typeof mock>
    ).mockReturnValueOnce(qb);

    await service.lookupProfile('DamirLut');

    expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('u');
    expect(qb.where.mock.calls[0][0]).toMatchObject({
      sql: 'lower(u.username) = ?',
      params: ['damirlut'],
    });
    expect(qb.orWhere.mock.calls[0][0]).toMatchObject({
      sql: 'lower(u.nickname) = ?',
      params: ['damirlut'],
    });
    expect(qb.limit).toHaveBeenCalledWith(1);
    expect(qb.getSingleResult).toHaveBeenCalled();
  });

  it('searches profiles with a normalized query and maps raw rows', async () => {
    em.execute = mock(async () => [
      {
        user_id: '123',
        username: 'Damir',
        nickname: 'Дамир',
        avatar_url: 'https://cdn.discordapp.com/a.png',
      },
    ]);

    const results = await service.searchProfiles('  Дам  ');

    expect(em.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = (em.execute as ReturnType<typeof mock>).mock
      .calls[0] as [string, unknown[], string];
    expect(sql).toContain('%>');
    expect(sql).toContain('word_similarity');
    expect(params).toEqual([
      'дам',
      'дам',
      'дам',
      'дам',
      'дам',
      'дам',
      'дам',
      'дам',
      'дам',
      'дам',
      5,
    ]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '123',
      username: 'Damir',
      nickname: 'Дамир',
      avatarUrl: 'https://cdn.discordapp.com/a.png',
    });
  });

  it('passes a custom limit to the search query', async () => {
    em.execute = mock(async () => []);

    await service.searchProfiles('dam', 3);

    const [, params] = (em.execute as ReturnType<typeof mock>).mock
      .calls[0] as [string, unknown[], string];
    expect(params?.at(-1)).toBe(3);
  });

  it('returns an empty list for short queries without hitting the database', async () => {
    em.execute = mock(async () => []);

    expect(await service.searchProfiles('д')).toEqual([]);
    expect(await service.searchProfiles('   ')).toEqual([]);
    expect(em.execute).not.toHaveBeenCalled();
  });

  it('updates profile info while preserving future profileInfo keys', async () => {
    const profile = createUserProfile(123n);
    profile.banner_alt = 'old banner';
    profile.birthDate = new Date('2000-01-02T00:00:00.000Z');
    profile.profileInfo = {
      about: 'old about',
      links: [
        {
          label: 'Old',
          icon: 'old',
          url: 'https://example.com/old',
        },
      ],
      location: 'Earth',
    } as UserProfileEntity['profileInfo'];
    (
      discordProfileSync.ensureUserProfile as ReturnType<typeof mock>
    ).mockResolvedValueOnce(profile);

    const result = await service.updateProfileInfo(123n, {
      bannerAlt: 'https://example.com/banner.png',
      birthDate: new Date('2001-02-03T00:00:00.000Z'),
      info: {
        about: '  new about  ',
      },
    });

    expect(result.banner_alt).toBe('https://example.com/banner.png');
    expect(result.birthDate).toEqual(new Date('2001-02-03T00:00:00.000Z'));
    expect(result.profileInfo).toEqual({
      about: 'new about',
      links: [
        {
          label: 'Old',
          icon: 'old',
          url: 'https://example.com/old',
        },
      ],
      location: 'Earth',
    });
    expect(em.persist).toHaveBeenCalledWith(profile);
    expect(em.flush).toHaveBeenCalled();
  });

  it('clears nullable profile info fields without removing unrelated keys', async () => {
    const profile = createUserProfile(123n);
    profile.banner_alt = 'https://example.com/banner.png';
    profile.birthDate = new Date('2001-02-03T00:00:00.000Z');
    profile.profileInfo = {
      about: 'old about',
      links: [
        {
          label: 'Old',
          icon: 'old',
          url: 'https://example.com/old',
        },
      ],
      location: 'Earth',
    } as UserProfileEntity['profileInfo'];
    (
      discordProfileSync.ensureUserProfile as ReturnType<typeof mock>
    ).mockResolvedValueOnce(profile);

    const result = await service.updateProfileInfo(123n, {
      bannerAlt: null,
      birthDate: null,
      info: {
        about: null,
        links: [],
      },
    });

    expect(result.banner_alt).toBeNull();
    expect(result.birthDate).toBeNull();
    expect(result.profileInfo).toEqual({
      about: null,
      links: [],
      location: 'Earth',
    });
  });

  it('filters birthday users by the current guild members table', async () => {
    const qb = createQueryBuilderMock<UserProfileEntity>();
    (
      userRepository.createQueryBuilder as ReturnType<typeof mock>
    ).mockReturnValueOnce(qb);

    await service.getBirthdayUsers(456n, 6, 15);

    expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('u');
    assertUsesGuildUsersTable(qb.where.mock.calls[0][0]);
  });

  it('filters users with birthdays by the current guild members table', async () => {
    const qb = createQueryBuilderMock<UserProfileEntity>();
    (
      userRepository.createQueryBuilder as ReturnType<typeof mock>
    ).mockReturnValueOnce(qb);

    await service.getUsersWithBirthdaySet(456n);

    expect(userRepository.createQueryBuilder).toHaveBeenCalledWith('u');
    assertUsesGuildUsersTable(qb.where.mock.calls[0][0]);
  });

  it('syncs a user profile from Discord and returns the fresh entity', async () => {
    const synced = await service.syncUserProfileFromDiscord(123n);

    expect(discordProfileSync.syncUserById).toHaveBeenCalledWith(123n);
    expect(synced?.user_id).toBe(123n);
    expect(synced?.username).toBe('synced');
  });

  it('returns null when the Discord sync fails without throwing', async () => {
    (
      discordProfileSync.syncUserById as ReturnType<typeof mock>
    ).mockRejectedValueOnce(new Error('rate limited'));

    await expect(service.syncUserProfileFromDiscord(123n)).resolves.toBeNull();
  });
});

function createQueryBuilderMock<T>(result: T[] = []) {
  let qb: {
    where: ReturnType<typeof mock>;
    orWhere: ReturnType<typeof mock>;
    andWhere: ReturnType<typeof mock>;
    limit: ReturnType<typeof mock>;
    getResult: ReturnType<typeof mock>;
    getSingleResult: ReturnType<typeof mock>;
  };
  qb = {
    where: mock(() => qb),
    orWhere: mock(() => qb),
    andWhere: mock(() => qb),
    limit: mock(() => qb),
    getResult: mock(() => Promise.resolve(result)),
    getSingleResult: mock(() => Promise.resolve(result[0] ?? null)),
  };
  return qb;
}

function createUserProfile(userId: bigint): UserProfileEntity {
  const profile = new UserProfileEntity();
  profile.user_id = userId;
  profile.username = 'alice';
  profile.avatar_url = 'https://cdn.discordapp.com/avatar.webp';
  profile.banner_color = '#fff';
  profile.firstJoinedAt = new Date('2026-06-01T00:00:00.000Z');
  profile.lastActiveAt = new Date('2026-06-13T00:00:00.000Z');
  return profile;
}

function assertUsesGuildUsersTable(condition: unknown): void {
  const { sql, params } = condition as { sql: string; params: unknown[] };

  expect(sql).toContain('FROM guild_users m');
  expect(sql).not.toContain('member_profiles');
  expect(params).toEqual([456n]);
}
