import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Client, Collection, Guild, GuildMember, Role } from 'discord.js';

import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { GuildMemberRoleEntity } from './entities/guild-member-role.entity';
import { GuildMemberRolesService } from './guild-member-roles.service';

function createMemberProfile() {
  const memberProfile = new MemberProfileEntity();
  memberProfile.guild_id = 10n;
  memberProfile.user_id = 20n;
  return memberProfile;
}

function createRole(id: string, options: Partial<Role> = {}) {
  return {
    id,
    name: `role-${id}`,
    tags: null,
    members: new Collection<string, GuildMember>(),
    ...options,
  } as unknown as Role;
}

function createMember(roleIds: string[] = []) {
  const cache = new Collection<string, Role>(
    roleIds.map((id) => [id, createRole(id)]),
  );
  return {
    id: '20',
    roles: {
      add: mock(async () => undefined),
      cache,
      remove: mock(async () => undefined),
    },
  } as unknown as GuildMember;
}

describe('GuildMemberRolesService', () => {
  let service: GuildMemberRolesService;
  let roleRepository: EntityRepository<GuildMemberRoleEntity>;
  let savedRoles: GuildMemberRoleEntity[];
  let em: EntityManager;
  let client: Client;

  beforeEach(() => {
    savedRoles = [];
    roleRepository = {
      find: mock(async (where) =>
        savedRoles.filter(
          (role) =>
            role.user_id === where.user_id && role.guild_id === where.guild_id,
        ),
      ),
    } as unknown as EntityRepository<GuildMemberRoleEntity>;

    em = {
      flush: mock(async () => undefined),
      persist: mock((entity: GuildMemberRoleEntity) => {
        savedRoles.push(entity);
        return em;
      }),
      remove: mock((entity: GuildMemberRoleEntity) => {
        savedRoles = savedRoles.filter((role) => role !== entity);
        return em;
      }),
    } as unknown as EntityManager;

    client = {
      guilds: {
        fetch: mock(async () => null),
      },
    } as unknown as Client;

    service = new GuildMemberRolesService(roleRepository, em, client);
  });

  it('saves current roles and skips everyone and managed roles', async () => {
    const memberProfile = createMemberProfile();
    const roles = new Collection<string, Role>([
      ['1', createRole('1')],
      ['2', createRole('2', { name: '@everyone' } as Partial<Role>)],
      ['3', createRole('3', { tags: {} } as Partial<Role>)],
    ]);

    await service.saveCurrentRoles(memberProfile, roles);

    expect(savedRoles.map((role) => role.role_id)).toEqual([1n]);
    expect(em.flush).toHaveBeenCalled();
  });

  it('removes saved roles that are no longer present', async () => {
    const memberProfile = createMemberProfile();
    const savedRole = new GuildMemberRoleEntity();
    savedRole.guild_id = memberProfile.guild_id;
    savedRole.user_id = memberProfile.user_id;
    savedRole.role_id = 1n;
    savedRoles.push(savedRole);

    await service.saveCurrentRoles(memberProfile, new Collection());

    expect(savedRoles).toEqual([]);
    expect(em.remove).toHaveBeenCalledWith(savedRole);
  });

  it('restores saved roles only when guild, member and role exist', async () => {
    const memberProfile = createMemberProfile();
    const savedRole = new GuildMemberRoleEntity();
    savedRole.guild_id = memberProfile.guild_id;
    savedRole.user_id = memberProfile.user_id;
    savedRole.role_id = 1n;
    savedRoles.push(savedRole);

    const member = createMember();
    const role = createRole('1');
    const guild = {
      members: { fetch: mock(async () => member) },
      roles: { fetch: mock(async () => role) },
    } as unknown as Guild;
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue(guild);

    await service.restoreSavedRoles(memberProfile);

    expect(member.roles.add).toHaveBeenCalledWith(
      role,
      'Restoring saved member role',
    );
  });

  it('adds and removes guild roles idempotently', async () => {
    const role = createRole('1');
    const member = createMember();
    const guild = {
      members: { fetch: mock(async () => member) },
      roles: { fetch: mock(async () => role) },
    } as unknown as Guild;
    (client.guilds.fetch as ReturnType<typeof mock>).mockResolvedValue(guild);

    await service.addGuildRole(10n, 20n, 1n, 'add reason');
    expect(member.roles.add).toHaveBeenCalledWith(role, 'add reason');

    member.roles.cache.set(role.id, role);
    await service.addGuildRole(10n, 20n, 1n, 'add reason');
    expect(member.roles.add).toHaveBeenCalledTimes(1);

    await service.removeGuildRole(10n, 20n, 1n, 'remove reason');
    expect(member.roles.remove).toHaveBeenCalledWith(role, 'remove reason');

    member.roles.cache.delete(role.id);
    await service.removeGuildRole(10n, 20n, 1n, 'remove reason');
    expect(member.roles.remove).toHaveBeenCalledTimes(1);
  });
});
