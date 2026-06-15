import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, Collection, GuildMember, User } from 'discord.js';

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
      find: mock(() => Promise.resolve([])),
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
      users: {
        fetch: mock(() => Promise.resolve(createUser('123'))),
      },
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
      }),
      expect.objectContaining({
        onConflictFields: ['user_id'],
        onConflictMergeFields: [
          'username',
          'avatar_url',
          'banner',
          'banner_color',
        ],
      }),
    );
  });

  it('stores guild-specific Discord member fields on member profile', async () => {
    const member = createMember('123', '456');

    await expect(service.syncMember(member)).resolves.toMatchObject({
      user_id: 123n,
      guild_id: 456n,
      nickname: 'nick-123',
      avatar_url: 'member-avatar-123',
      banner: 'member-banner-123',
      display_color: '#123456',
      isLeftGuild: false,
      leftAt: null,
    });

    expect(em.upsert).toHaveBeenCalledWith(
      MemberProfileEntity,
      expect.objectContaining({
        user_id: 123n,
        guild_id: 456n,
        nickname: 'nick-123',
        avatar_url: 'member-avatar-123',
        banner: 'member-banner-123',
        display_color: '#123456',
      }),
      expect.objectContaining({
        onConflictFields: ['user_id', 'guild_id'],
      }),
    );
  });

  it('fetches and syncs users by id with an explicit concurrency limit', async () => {
    await service.syncUsersById([111n, 222n], 1);

    expect(client.users.fetch).toHaveBeenCalledWith('111', { force: true });
    expect(client.users.fetch).toHaveBeenCalledWith('222', { force: true });
    expect(em.upsert).toHaveBeenCalledTimes(2);
  });

  it('does not fetch users that were synced recently', async () => {
    const freshUser = new UserProfileEntity();
    freshUser.user_id = 111n;
    freshUser.updatedAt = new Date();
    (userRepository.find as ReturnType<typeof mock>).mockResolvedValueOnce([
      freshUser,
    ]);

    await service.syncUsersById([111n], 1);

    expect(client.users.fetch).not.toHaveBeenCalled();
  });

  it('syncs fetched guild member by id explicitly', async () => {
    await expect(
      service.syncGuildMemberById(456n, 123n),
    ).resolves.toMatchObject({
      user_id: 123n,
      guild_id: 456n,
    });

    expect(client.guilds.fetch).toHaveBeenCalledWith('456');
  });

  it('syncs a collection of members with explicit concurrency', async () => {
    const members = new Collection<string, GuildMember>([
      ['111', createMember('111', '456')],
      ['222', createMember('222', '456')],
    ]);

    await service.syncMembers(members, 1);

    expect(em.upsert).toHaveBeenCalledTimes(4);
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

function createMember(id: string, guildId: string): GuildMember {
  return {
    id,
    user: createUser(id),
    guild: { id: guildId },
    nickname: `nick-${id}`,
    displayAvatarURL: mock(() => `member-avatar-${id}`),
    bannerURL: mock(() => `member-banner-${id}`),
    displayHexColor: '#123456',
    joinedAt: new Date('2026-06-12T00:00:00.000Z'),
  } as unknown as GuildMember;
}
