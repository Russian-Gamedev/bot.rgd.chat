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
