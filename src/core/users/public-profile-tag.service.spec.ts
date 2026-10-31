import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, Collection, type Role } from 'discord.js';

import { MetricsService } from '#common/metrics/metrics.service';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { PatronTagService } from './patron-tag.service';
import {
  getContrastColor,
  PublicProfileTagService,
} from './public-profile-tag.service';

describe('PublicProfileTagService', () => {
  let service: PublicProfileTagService;
  let memberProfileRepository: EntityRepository<MemberProfileEntity>;
  let userProfileTagRepository: EntityRepository<UserProfileTagEntity>;
  let em: EntityManager;
  let nativeUpdate: ReturnType<typeof mock>;
  let client: Client;
  let discordProfileSync: DiscordProfileSyncService;
  let patronTagService: PatronTagService;
  let metrics: MetricsService;

  beforeEach(() => {
    memberProfileRepository = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<MemberProfileEntity>;
    userProfileTagRepository = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<UserProfileTagEntity>;
    nativeUpdate = mock(() => Promise.resolve(1));
    em = Object.assign(Object.create(EntityManager.prototype), {
      name: 'default',
      nativeUpdate,
      fork: () => em,
    }) as EntityManager;
    client = {
      guilds: {
        cache: new Collection(),
      },
    } as unknown as Client;
    discordProfileSync = {
      syncGuildMemberById: mock(() => Promise.resolve(null)),
    } as unknown as DiscordProfileSyncService;
    patronTagService = {
      getTag: mock(() => Promise.resolve(null)),
    } as unknown as PatronTagService;
    metrics = {
      recordProfileSync: mock(() => undefined),
    } as unknown as MetricsService;

    service = new PublicProfileTagService(
      memberProfileRepository,
      userProfileTagRepository,
      em,
      client,
      discordProfileSync,
      patronTagService,
      metrics,
    );
  });

  function refreshRole(guildId: bigint, userId: bigint): Promise<void> {
    return (
      service as unknown as {
        refreshMembershipRole(g: bigint, u: bigint): Promise<void>;
      }
    ).refreshMembershipRole(guildId, userId);
  }

  it('returns the highest current non-managed role per active guild as a public tag', async () => {
    const membership = createMemberProfile(10n, 123n, {
      highestRoleId: 4n,
      roleSyncedAt: new Date(),
    });
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [membership],
    );
    setGuilds(client, [
      createGuild('10', [
        createRole('1', '@everyone', 100, '#ffffff'),
        createRole('2', 'Member', 1, '#111111'),
        createRole('3', 'Bot', 20, '#222222', {}),
        createRole('4', 'Admin', 10, '#ff0000'),
      ]),
    ]);

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([
      {
        name: 'Admin',
        color: '#ffffff',
        background: '#ff0000',
        description: 'Роль на сервере RGD',
      },
    ]);
    expect(memberProfileRepository.find).toHaveBeenCalledWith({
      user_id: 123n,
      isLeftGuild: false,
    });
    expect(discordProfileSync.syncGuildMemberById).not.toHaveBeenCalled();
  });

  it('serves the stored role immediately and refreshes it in the background', async () => {
    const membership = createMemberProfile(10n, 123n, {
      highestRoleId: 4n,
      roleSyncedAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [membership],
    );
    let resolveSync!: (value: MemberProfileEntity) => void;
    (
      discordProfileSync.syncGuildMemberById as ReturnType<typeof mock>
    ).mockImplementationOnce(
      () =>
        new Promise<MemberProfileEntity>((resolve) => {
          resolveSync = resolve;
        }),
    );
    setGuilds(client, [
      createGuild('10', [createRole('4', 'Admin', 10, '#ff0000')]),
    ]);

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([
      {
        name: 'Admin',
        color: '#ffffff',
        background: '#ff0000',
        description: 'Роль на сервере RGD',
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(discordProfileSync.syncGuildMemberById).toHaveBeenCalledWith(
      10n,
      123n,
      { force: true },
    );

    resolveSync(
      createMemberProfile(10n, 123n, {
        highestRoleId: 4n,
        roleSyncedAt: new Date(),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(metrics.recordProfileSync).toHaveBeenCalledWith(
      'fresh',
      expect.any(Number),
    );
  });

  it('records an error, logs it and backs off when the sync fails', async () => {
    const warn = mock(() => undefined);
    (service as unknown as { logger: { warn: typeof warn } }).logger.warn =
      warn;
    (
      discordProfileSync.syncGuildMemberById as ReturnType<typeof mock>
    ).mockRejectedValue(new Error('Discord unavailable'));

    await refreshRole(10n, 123n);

    expect(metrics.recordProfileSync).toHaveBeenCalledWith(
      'error',
      expect.any(Number),
    );
    expect(nativeUpdate).toHaveBeenCalledWith(
      MemberProfileEntity,
      { guild_id: 10n, user_id: 123n },
      { roleSyncedAt: expect.any(Date) },
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Discord unavailable'),
    );
  });

  it('records none and backs off when the member is not found', async () => {
    (
      discordProfileSync.syncGuildMemberById as ReturnType<typeof mock>
    ).mockResolvedValue(null);

    await refreshRole(10n, 123n);

    expect(metrics.recordProfileSync).toHaveBeenCalledWith(
      'none',
      expect.any(Number),
    );
    expect(nativeUpdate).toHaveBeenCalledWith(
      MemberProfileEntity,
      { guild_id: 10n, user_id: 123n },
      { roleSyncedAt: expect.any(Date) },
    );
  });

  it('deduplicates concurrent background refreshes', async () => {
    let resolveSync!: (value: MemberProfileEntity | null) => void;
    (
      discordProfileSync.syncGuildMemberById as ReturnType<typeof mock>
    ).mockImplementationOnce(
      () =>
        new Promise<MemberProfileEntity | null>((resolve) => {
          resolveSync = resolve;
        }),
    );

    const first = refreshRole(10n, 123n);
    const second = refreshRole(10n, 123n);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(discordProfileSync.syncGuildMemberById).toHaveBeenCalledTimes(1);

    resolveSync(null);
    await Promise.all([first, second]);
  });

  it('does not refresh a recently synced member without a role', async () => {
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [createMemberProfile(10n, 123n, { roleSyncedAt: new Date() })],
    );

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([]);
    expect(discordProfileSync.syncGuildMemberById).not.toHaveBeenCalled();
  });

  it('skips roles when the guild or role is missing from the cache', async () => {
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [
        createMemberProfile(10n, 123n, {
          highestRoleId: 4n,
          roleSyncedAt: new Date(),
        }),
        createMemberProfile(20n, 123n, {
          highestRoleId: 5n,
          roleSyncedAt: new Date(),
        }),
      ],
    );
    setGuilds(client, [
      createGuild('10', [createRole('3', 'Member', 1, '#111111')]),
    ]);

    await expect(service.getPublicProfileTags(123n)).resolves.toEqual([]);
  });

  it('appends patron and custom tags after generated role tags', async () => {
    (memberProfileRepository.find as ReturnType<typeof mock>).mockResolvedValue(
      [
        createMemberProfile(10n, 123n, {
          highestRoleId: 1n,
          roleSyncedAt: new Date(),
        }),
      ],
    );
    setGuilds(client, [
      createGuild('10', [createRole('1', 'Admin', 10, '#ff0000')]),
    ]);
    (patronTagService.getTag as ReturnType<typeof mock>).mockResolvedValue({
      name: '1\u00A0500\u00A0\u20BD',
      color: '#5C87E7',
      background: '#FEFEFE',
      description: 'Донат',
    });

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
        color: '#ffffff',
        background: '#ff0000',
        description: 'Роль на сервере RGD',
      },
      {
        name: '1\u00A0500\u00A0\u20BD',
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
    expect(patronTagService.getTag).toHaveBeenCalledWith(123n);
    expect(userProfileTagRepository.find).toHaveBeenCalledWith(
      { user_id: 123n },
      { orderBy: { id: 'ASC' } },
    );
  });
});

describe('getContrastColor', () => {
  it('returns white for ee5245', () => {
    expect(getContrastColor('#ee5245')).toBe('#ffffff');
  });

  it('returns white for fee761', () => {
    expect(getContrastColor('#fee761')).toBe('#ffffff');
  });

  it('returns black for 9e6bff', () => {
    expect(getContrastColor('#9e6bff')).toBe('#000000');
  });

  it('returns white for dark colors', () => {
    expect(getContrastColor('#111111')).toBe('#ffffff');
  });

  it('returns black for very bright colors', () => {
    expect(getContrastColor('#ffffff')).toBe('#000000');
    expect(getContrastColor('#ffff00')).toBe('#000000');
  });
});

function createGuild(id: string, roles: Role[]) {
  const guild = {
    id,
    name: 'RGD',
    roles: {
      cache: new Collection(roles.map((role) => [role.id, role])),
    },
  };

  for (const role of roles) {
    Object.assign(role, { guild });
  }

  return guild;
}

function setGuilds(client: Client, guilds: ReturnType<typeof createGuild>[]) {
  const cache = client.guilds.cache as unknown as Collection<string, unknown>;
  cache.clear();
  for (const guild of guilds) {
    cache.set(guild.id, guild);
  }
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

function createMemberProfile(
  guildId: bigint,
  userId: bigint,
  overrides: Partial<MemberProfileEntity> = {},
): MemberProfileEntity {
  const member = new MemberProfileEntity();
  member.guild_id = guildId;
  member.user_id = userId;
  Object.assign(member, overrides);
  return member;
}
