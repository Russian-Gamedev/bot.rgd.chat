import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { BadRequestException } from '@nestjs/common';
import { Client, Collection, type Role } from 'discord.js';

import { PatronEntity } from '#core/patrons/entities/patron.entity';
import type { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { UserService } from './users.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: EntityRepository<UserProfileEntity>;
  let memberProfileRepository: EntityRepository<MemberProfileEntity>;
  let patronRepository: EntityRepository<PatronEntity>;
  let userProfileTagRepository: EntityRepository<UserProfileTagEntity>;
  let em: EntityManager;
  let discordProfileSync: DiscordProfileSyncService;
  let client: Client;

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
    patronRepository = {
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<PatronEntity>;
    userProfileTagRepository = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<UserProfileTagEntity>;
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
    client = {
      guilds: {
        fetch: mock(() => Promise.resolve(null)),
      },
    } as unknown as Client;

    service = new UserService(
      userRepository,
      memberProfileRepository,
      patronRepository,
      userProfileTagRepository,
      em,
      discordProfileSync,
      client,
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

  it('returns the highest current non-managed role per active guild as a public tag', async () => {
    const membership = createMemberProfile(10n, 123n);
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [membership],
    );
    const guild = createGuild([
      createRole('1', '@everyone', 100, '#ffffff'),
      createRole('2', 'Member', 1, '#111111'),
      createRole('3', 'Bot', 20, '#222222', {}),
      createRole('4', 'Admin', 10, '#ff0000'),
    ]);
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue(guild);

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([
      {
        name: 'Admin',
        color: '#ff0000',
        background: '#ff000029',
        description: 'Роль на сервере RGD',
      },
    ]);
    expect(memberProfileRepository.find).toHaveBeenCalledWith({
      user_id: 123n,
      isLeftGuild: false,
    });
  });

  it('skips role tags when only everyone or managed roles exist', async () => {
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [createMemberProfile(10n, 123n)],
    );
    const guild = createGuild([
      createRole('1', '@everyone', 100, '#ffffff'),
      createRole('2', 'Bot', 20, '#222222', {}),
    ]);
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue(guild);

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([]);
  });

  it('appends patron and custom tags after generated role tags', async () => {
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [createMemberProfile(10n, 123n)],
    );
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue(
      createGuild([createRole('1', 'Admin', 10, '#ff0000')]),
    );
    const patron = new PatronEntity();
    patron.user_id = 123n;
    patron.value = 1500;
    (patronRepository.findOne as ReturnType<typeof mock>).mockResolvedValue(
      patron,
    );
    const customTag = new UserProfileTagEntity();
    customTag.user_id = 123n;
    customTag.name = 'Founder';
    customTag.color = '#ffffff';
    customTag.background = '#111827';
    customTag.description = 'Кастомный тег';
    (
      userProfileTagRepository.find as ReturnType<typeof mock>
    ).mockResolvedValue([customTag]);

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([
      {
        name: 'Admin',
        color: '#ff0000',
        background: '#ff000029',
        description: 'Роль на сервере RGD',
      },
      {
        name: '1 500 ₽',
        color: '#5C87E7',
        background: '#FEFEFE',
        description: 'Донат',
      },
      {
        name: 'Founder',
        color: '#ffffff',
        background: '#111827',
        description: 'Кастомный тег',
      },
    ]);
    expect(userProfileTagRepository.find).toHaveBeenCalledWith(
      { user_id: 123n },
      { orderBy: { id: 'ASC' } },
    );
  });

  it('does not add patron tag for missing or non-positive patron value', async () => {
    const patron = new PatronEntity();
    patron.user_id = 123n;
    patron.value = 0;
    (patronRepository.findOne as ReturnType<typeof mock>).mockResolvedValue(
      patron,
    );

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([]);
  });

  it('skips Discord role tags when guild fetch fails', async () => {
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [createMemberProfile(10n, 123n)],
    );
    (client.guilds.fetch as ReturnType<typeof mock>).mockRejectedValue(
      new Error('Discord unavailable'),
    );

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([]);
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

function createMemberProfile(
  guildId: bigint,
  userId: bigint,
): MemberProfileEntity {
  const member = new MemberProfileEntity();
  member.guild_id = guildId;
  member.user_id = userId;
  return member;
}

function createGuild(roles: Role[]) {
  const guild = {
    name: 'RGD',
    members: {
      fetch: mock(async () => ({
        roles: {
          cache: new Collection(roles.map((role) => [role.id, role])),
        },
      })),
    },
  };

  for (const role of roles) {
    Object.assign(role, { guild });
  }

  return guild;
}

function createRole(
  id: string,
  name: string,
  position: number,
  hexColor: string,
  tags: Role['tags'] = null,
): Role {
  return {
    id,
    name,
    position,
    hexColor,
    tags,
  } as Role;
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
