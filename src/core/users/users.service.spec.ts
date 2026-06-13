import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, Guild, GuildMember } from 'discord.js';

import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserService } from './users.service';

describe('UserService', () => {
  let service: UserService;
  let userRepository: EntityRepository<UserProfileEntity>;
  let memberProfileRepository: EntityRepository<MemberProfileEntity>;
  let em: EntityManager;
  let client: Client;

  beforeEach(() => {
    userRepository = {
      find: mock(() => Promise.resolve([])),
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<UserProfileEntity>;
    memberProfileRepository = {
      find: mock(() => Promise.resolve([])),
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<MemberProfileEntity>;
    em = {
      persist: mock(() => em),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;
    client = {
      guilds: {
        fetch: mock(() => Promise.resolve(null)),
      },
    } as unknown as Client;

    service = new UserService(
      userRepository,
      memberProfileRepository,
      em,
      client,
    );
  });

  it('creates both global user and guild membership', async () => {
    const user = await service.findOrCreateMember(456n, 123n);

    expect(user.user_id).toBe(123n);
    expect(user.guild_id).toBe(456n);
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 123n }) as UserProfileEntity,
    );
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        guild_id: 456n,
        user_id: 123n,
      }) as MemberProfileEntity,
    );
  });

  it('updates avatar URL and nickname from Discord member data', async () => {
    const profile = new UserProfileEntity();
    profile.user_id = 123n;
    profile.firstJoinedAt = new Date('2026-06-13T00:00:00.000Z');
    profile.avatar_url = 'old-avatar.png';

    const guildUser = new MemberProfileEntity();
    guildUser.user_id = 123n;
    guildUser.guild_id = 456n;

    (userRepository.findOne as ReturnType<typeof mock>).mockResolvedValue(
      profile,
    );

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

    await service.syncDiscordProfile(guildUser);

    expect(guild.members.fetch).toHaveBeenCalledWith({
      user: '123',
      force: true,
    });
    expect(profile.username).toBe('discord-user');
    expect(profile.nickname).toBe('server-nick');
    expect(profile.avatar_url).toBe('https://cdn.discordapp.com/avatar.webp');
    expect(profile.firstJoinedAt).toEqual(new Date('2026-06-12T00:00:00.000Z'));
    expect(em.persist).toHaveBeenCalledWith(profile);
    expect(em.persist).toHaveBeenCalledWith(guildUser);
    expect(em.flush).toHaveBeenCalled();
  });

  it('refreshes active guild users in batches and counts failed updates', async () => {
    const first = new MemberProfileEntity();
    first.id = 1;
    const second = new MemberProfileEntity();
    second.id = 2;
    const third = new MemberProfileEntity();
    third.id = 3;

    (memberProfileRepository.find as ReturnType<typeof mock>)
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([third])
      .mockResolvedValueOnce([]);
    service.syncDiscordProfile = mock(async (user: MemberProfileEntity) => {
      if (user === second) throw new Error('Discord fetch failed');
    }) as unknown as UserService['syncDiscordProfile'];

    await expect(service.refreshUsersData(2)).resolves.toEqual({
      refreshed: 2,
      failed: 1,
    });
    expect(memberProfileRepository.find).toHaveBeenCalledWith(
      { id: { $gt: 0 }, isLeftGuild: false },
      { limit: 2, orderBy: { id: 'asc' } },
    );
    expect(memberProfileRepository.find).toHaveBeenCalledWith(
      { id: { $gt: 2 }, isLeftGuild: false },
      { limit: 2, orderBy: { id: 'asc' } },
    );
  });
});
