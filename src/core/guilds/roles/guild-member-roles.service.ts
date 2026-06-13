import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Client, Collection, Role } from 'discord.js';

import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { DiscordID } from '#root/lib/types';

import { GuildMemberRoleEntity } from './entities/guild-member-role.entity';

@Injectable()
export class GuildMemberRolesService {
  constructor(
    @InjectRepository(GuildMemberRoleEntity)
    private readonly guildMemberRoleRepository: EntityRepository<GuildMemberRoleEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
  ) {}

  async saveCurrentRoles(
    memberProfile: MemberProfileEntity,
    discordRoles: Collection<string, Role>,
  ): Promise<void> {
    const savedRoles = await this.guildMemberRoleRepository.find({
      user_id: memberProfile.user_id,
      guild_id: memberProfile.guild_id,
    });

    for (const role of savedRoles) {
      if (!discordRoles.has(role.role_id.toString())) {
        this.em.remove(role);
      }
    }

    for (const role of discordRoles.values()) {
      if (role.name === '@everyone') continue;
      if (role.tags) continue;

      const existing = savedRoles.find((r) => r.role_id === BigInt(role.id));
      if (existing) continue;

      const newRole = new GuildMemberRoleEntity();
      newRole.user_id = memberProfile.user_id;
      newRole.guild_id = memberProfile.guild_id;
      newRole.role_id = BigInt(role.id);
      this.em.persist(newRole);
    }

    await this.em.flush();
  }

  async restoreSavedRoles(memberProfile: MemberProfileEntity): Promise<void> {
    const roles = await this.guildMemberRoleRepository.find({
      user_id: memberProfile.user_id,
      guild_id: memberProfile.guild_id,
    });
    if (roles.length === 0) return;

    const guild = await this.client.guilds
      .fetch(memberProfile.guild_id.toString())
      .catch(() => null);
    if (!guild) return;

    const member = await guild.members
      .fetch(memberProfile.user_id.toString())
      .catch(() => null);
    if (!member) return;

    for (const role of roles) {
      const discordRole = await guild.roles
        .fetch(role.role_id.toString())
        .catch(() => null);
      if (!discordRole) continue;

      if (!member.roles.cache.has(discordRole.id)) {
        await member.roles.add(discordRole, 'Restoring saved member role');
      }
    }
  }

  async addGuildRole(
    guildId: DiscordID,
    userId: DiscordID,
    roleId: DiscordID,
    reason?: string,
  ): Promise<void> {
    const roleAssignment = await this.getRoleAssignment(
      guildId,
      userId,
      roleId,
    );
    if (!roleAssignment) return;

    const { member, role } = roleAssignment;
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, reason);
    }
  }

  async removeGuildRole(
    guildId: DiscordID,
    userId: DiscordID,
    roleId: DiscordID,
    reason?: string,
  ): Promise<void> {
    const roleAssignment = await this.getRoleAssignment(
      guildId,
      userId,
      roleId,
    );
    if (!roleAssignment) return;

    const { member, role } = roleAssignment;
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, reason);
    }
  }

  async removeRoleFromCurrentMembers(
    role: Role,
    reason?: string,
  ): Promise<void> {
    for (const member of role.members.values()) {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, reason);
      }
    }
  }

  private async getRoleAssignment(
    guildId: DiscordID,
    userId: DiscordID,
    roleId: DiscordID,
  ) {
    const guild = await this.client.guilds
      .fetch(guildId.toString())
      .catch(() => null);
    if (!guild) return null;

    const member = await guild.members
      .fetch(userId.toString())
      .catch(() => null);
    if (!member) return null;

    const role = await guild.roles.fetch(roleId.toString()).catch(() => null);
    if (!role) return null;

    return { member, role };
  }
}
