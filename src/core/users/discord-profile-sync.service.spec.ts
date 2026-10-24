import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, Collection, GuildMember, type Role, User } from 'discord.js';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';

describe('DiscordProfileSyncService', () => {
  let service: DiscordProfileSyncService;
  let userRepository: EntityRepository<UserProfileEntity>;
  let memberProfileRepository: EntityRepository<MemberProfileEntity>;
  let em: EntityManager;
  let client: Client;

  beforeEach(() => {
    userRepository = {
      findOneOrFail: mock(async ({ user_id }: { user_id: bigint }) => {
        const user = new UserProfileEntity();
        user.user_id = user_id;
        return user;
      }),
    } as unknown as EntityRepository<UserProfileEntity>;
    memberProfileRepository = {
      findOneOrFail: mock(
        async ({
          user_id,
          guild_id,
        }: {
          user_id: bigint;
          guild_id: bigint;
        }) => {
          const member = new MemberProfileEntity();
          member.user_id = user_id;
          member.guild_id = guild_id;
          return member;
        },
      ),
    } as unknown as EntityRepository<MemberProfileEntity>;
    em = {
      upsert: mock(async (_entity, data) => data),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;
    client = {
      guilds: {
        fetch: mock(() =>
          Promise.resolve({
            members: {
              fetch: mock(() => Promise.resolve(createMember('123', '456'))),
              cache: { get: mock(() => undefined) },
            },
          }),
        ),
      },
    } as unknown as Client;

    service = new DiscordProfileSyncService(
      userRepository,
      memberProfileRepository,
      em,
      client,
    );
  });

  it('upserts global Discord user fields without guild-specific member data', async () => {
    const user = createUser('123');

    await expect(service.syncUser(user)).resolves.toMatchObject({
      user_id: 123n,
      username: 'user-123',
      avatar_url: 'avatar-123',
      banner: 'banner-123',
      banner_color: '#abc',
    });

    expect(em.upsert).toHaveBeenCalledWith(
      UserProfileEntity,
      expect.objectContaining({
        user_id: 123n,
        username: 'user-123',
        nickname: null,
        avatar_url: 'avatar-123',
        banner: 'banner-123',
        banner_color: '#abc',
        updatedAt: expect.any(Date),
      }),
      expect.objectContaining({
        onConflictFields: ['user_id'],
        onConflictMergeFields: [
          'username',
          'avatar_url',
          'banner',
          'banner_color',
          'updatedAt',
        ],
      }),
    );
  });

  it('stores guild-specific Discord member fields and the highest role', async () => {
    const member = createMember('123', '456', [
      createRole('1', '@everyone', 100),
      createRole('2', 'Bot', 20, {}),
      createRole('3', 'Member', 1),
      createRole('4', 'Admin', 10),
    ]);

    await expect(service.syncMember(member)).resolves.toMatchObject({
      user_id: 123n,
      guild_id: 456n,
      nickname: 'nick-123',
      avatar_url: 'member-avatar-123',
      banner: 'member-banner-123',
      display_color: '#123456',
      highestRoleId: 4n,
      isLeftGuild: false,
      leftAt: null,
    });

    const memberUpsert = (em.upsert as ReturnType<typeof mock>).mock.calls.find(
      ([entity]) => entity === MemberProfileEntity,
    );
    expect(memberUpsert).toBeDefined();

    const [, memberData, memberOptions] = memberUpsert!;
    expect(memberData).toMatchObject({
      user_id: 123n,
      guild_id: 456n,
      nickname: 'nick-123',
      avatar_url: 'member-avatar-123',
      banner: 'member-banner-123',
      display_color: '#123456',
      highestRoleId: 4n,
    });
    expect(memberData.roleSyncedAt).toBeInstanceOf(Date);
    expect(memberData.updatedAt).toBeInstanceOf(Date);
    expect(memberOptions).toEqual({
      onConflictFields: ['user_id', 'guild_id'],
      onConflictMergeFields: [
        'nickname',
        'avatar_url',
        'banner',
        'display_color',
        'highestRoleId',
        'roleSyncedAt',
        'isLeftGuild',
        'leftAt',
        'updatedAt',
      ],
    });
  });

  it('stores a null highest role when only everyone or managed roles exist', async () => {
    const member = createMember('123', '456', [
      createRole('1', '@everyone', 100),
      createRole('2', 'Bot', 20, {}),
    ]);

    await expect(service.syncMember(member)).resolves.toMatchObject({
      highestRoleId: null,
      roleSyncedAt: expect.any(Date),
    });
  });

  it('uses a cached guild member without a forced fetch by default', async () => {
    const cachedMember = createMember('123', '456');
    const fetchMember = mock(() => Promise.resolve(cachedMember));
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue({
      members: {
        cache: {
          get: mock((id: string) => (id === '123' ? cachedMember : undefined)),
        },
        fetch: fetchMember,
      },
    });

    await expect(
      service.syncGuildMemberById(456n, 123n),
    ).resolves.toMatchObject({
      user_id: 123n,
      guild_id: 456n,
    });

    expect(fetchMember).not.toHaveBeenCalled();
  });

  it('force-fetches a guild member when requested', async () => {
    const cachedMember = createMember('123', '456');
    const freshMember = createMember('123', '456');
    const fetchMember = mock(() => Promise.resolve(freshMember));
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue({
      members: {
        cache: {
          get: mock((id: string) => (id === '123' ? cachedMember : undefined)),
        },
        fetch: fetchMember,
      },
    });

    await service.syncGuildMemberById(456n, 123n, { force: true });

    expect(fetchMember).toHaveBeenCalledWith({
      user: '123',
      force: true,
    });
  });
});

function createUser(id: string): User {
  return {
    id,
    username: `user-${id}`,
    displayAvatarURL: mock(() => `avatar-${id}`),
    bannerURL: mock(() => `banner-${id}`),
    hexAccentColor: '#abc',
  } as unknown as User;
}

function createRole(
  id: string,
  name: string,
  position: number,
  tags: Role['tags'] = null,
): Role {
  return {
    id,
    name,
    position,
    tags,
  } as Role;
}

function createMember(
  id: string,
  guildId: string,
  roles: Role[] = [createRole('4', 'Admin', 10)],
): GuildMember {
  return {
    id,
    user: createUser(id),
    guild: { id: guildId },
    nickname: `nick-${id}`,
    displayAvatarURL: mock(() => `member-avatar-${id}`),
    bannerURL: mock(() => `member-banner-${id}`),
    displayHexColor: '#123456',
    joinedAt: new Date('2026-06-12T00:00:00.000Z'),
    roles: {
      cache: new Collection(roles.map((role) => [role.id, role])),
    },
  } as unknown as GuildMember;
}
