import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, Guild, GuildMember } from 'discord.js';

import { UserEntity } from './entities/user.entity';
import { UserRoleEntity } from './entities/user-roles.entity';
import { UserService } from './users.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: EntityRepository<UserEntity>;
  let userRoleRepository: EntityRepository<UserRoleEntity>;
  let em: EntityManager;
  let client: Client;

  beforeEach(() => {
    userRepository = {
      find: mock(() => Promise.resolve([])),
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<UserEntity>;
    userRoleRepository = {} as EntityRepository<UserRoleEntity>;
    em = {
      persist: mock(() => em),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;
    client = {
      guilds: {
        fetch: mock(() => Promise.resolve(null)),
      },
    } as unknown as Client;

    service = new UserService(userRepository, userRoleRepository, em, client);
  });

  it('updates avatar URL and nickname from Discord member data', async () => {
    const user = new UserEntity();
    user.user_id = 123n;
    user.guild_id = 456n;

    const member = {
      user: { username: 'discord-user' },
      nickname: 'server-nick',
      displayAvatarURL: mock(() => 'https://cdn.discordapp.com/avatar.webp'),
      bannerURL: mock(() => null),
      displayHexColor: '#abc',
      joinedAt: new Date('2026-06-12T00:00:00.000Z'),
    } as unknown as GuildMember;
    const guild = {
      members: {
        fetch: mock(() => Promise.resolve(member)),
        cache: {
          get: mock(() => undefined),
        },
      },
    } as unknown as Guild;
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValueOnce(
      guild,
    );

    await service.updateUserData(user);

    expect(guild.members.fetch).toHaveBeenCalledWith({
      user: '123',
      force: true,
    });
    expect(user.username).toBe('discord-user');
    expect(user.nickname).toBe('server-nick');
    expect(user.avatar).toBe('https://cdn.discordapp.com/avatar.webp');
    expect(em.persist).toHaveBeenCalledWith(user);
    expect(em.flush).toHaveBeenCalled();
  });

  it('refreshes active users in batches and counts failed updates', async () => {
    const first = new UserEntity();
    first.id = 1;
    const second = new UserEntity();
    second.id = 2;
    const third = new UserEntity();
    third.id = 3;

    (userRepository.find as ReturnType<typeof mock>)
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([third])
      .mockResolvedValueOnce([]);
    service.updateUserData = mock(async (user: UserEntity) => {
      if (user === second) throw new Error('Discord fetch failed');
    }) as unknown as UserService['updateUserData'];

    await expect(service.refreshUsersData(2)).resolves.toEqual({
      refreshed: 2,
      failed: 1,
    });
    expect(userRepository.find).toHaveBeenCalledWith(
      { id: { $gt: 0 }, is_left_guild: false },
      { limit: 2, orderBy: { id: 'asc' } },
    );
    expect(userRepository.find).toHaveBeenCalledWith(
      { id: { $gt: 2 }, is_left_guild: false },
      { limit: 2, orderBy: { id: 'asc' } },
    );
  });
});
