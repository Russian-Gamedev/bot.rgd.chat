import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Client, Collection, type Role } from 'discord.js';

import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { PublicProfileTagService } from './public-profile-tag.service';

describe('PublicProfileTagService', () => {
  let service: PublicProfileTagService;
  let memberProfileRepository: EntityRepository<MemberProfileEntity>;
  let userProfileTagRepository: EntityRepository<UserProfileTagEntity>;
  let client: Client;

  beforeEach(() => {
    memberProfileRepository = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<MemberProfileEntity>;
    userProfileTagRepository = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<UserProfileTagEntity>;
    client = {
      guilds: {
        fetch: mock(() => Promise.resolve(null)),
      },
    } as unknown as Client;

    service = new PublicProfileTagService(
      memberProfileRepository,
      userProfileTagRepository,
      client,
    );
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
        color: '#000000',
        background: '#ff0000',
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
    const previousFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify([{ user: { id: '123' }, value: 1500 }]), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const customTag = new UserProfileTagEntity();
    customTag.user_id = 123n;
    customTag.name = 'Founder';
    customTag.color = '#ffffff';
    customTag.background = '#111827';
    customTag.description = 'Кастомный тег';
    (
      userProfileTagRepository.find as ReturnType<typeof mock>
    ).mockResolvedValue([customTag]);

    try {
      await expect(service.getPublicProfileTags(123n)).resolves.toEqual([
        {
          name: 'Admin',
          color: '#000000',
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
      expect(userProfileTagRepository.find).toHaveBeenCalledWith(
        { user_id: 123n },
        { orderBy: { id: 'ASC' } },
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('does not add patron tag for missing or non-positive patron value', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify([{ user: { id: '123' }, value: 0 }]), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    try {
      await expect(service.getPublicProfileTags(123n)).resolves.toEqual([]);
    } finally {
      globalThis.fetch = previousFetch;
    }
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
});

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

function createMemberProfile(
  guildId: bigint,
  userId: bigint,
): MemberProfileEntity {
  const member = new MemberProfileEntity();
  member.guild_id = guildId;
  member.user_id = userId;
  return member;
}
