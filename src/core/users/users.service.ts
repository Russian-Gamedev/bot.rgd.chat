import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Client, Collection, Role } from 'discord.js';

import { DiscordID } from '#root/lib/types';
import { getDefaultAvatar, getDisplayAvatar, noop } from '#root/lib/utils';

import { UserEntity } from './entities/user.entity';
import { UserRoleEntity } from './entities/user-roles.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: EntityRepository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: EntityRepository<UserRoleEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
  ) {}

  async findOrCreate(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<UserEntity> {
    guildId = BigInt(guildId);
    userId = BigInt(userId);

    let user = await this.userRepository.findOne({
      user_id: userId,
      guild_id: guildId,
    });
    if (!user) {
      user = new UserEntity();
      user.user_id = userId;
      user.guild_id = guildId;
      user.avatar = getDefaultAvatar(userId.toString());
      await this.updateUserData(user).catch(noop);
    }
    return user;
  }

  async save(user: UserEntity): Promise<void> {
    await this.em.persist(user).flush();
  }

  async getUserFromGuilds(user_id: DiscordID) {
    return this.userRepository.find({ user_id });
  }

  async getNewUsers(since: Date, guildId: DiscordID): Promise<UserEntity[]> {
    return this.userRepository.find({
      first_joined_at: { $gte: since },
      guild_id: guildId,
      is_left_guild: false,
    });
  }

  async updateUserData(user: UserEntity): Promise<void> {
    const guild = await this.client.guilds.fetch(user.guild_id.toString());
    if (!guild) return;
    const discordUser = await guild.members
      .fetch(user.user_id.toString())
      .catch(() => guild.members.cache.get(user.user_id.toString()));
    if (!discordUser) return;
    user.username = discordUser.user.username;
    user.avatar = getDisplayAvatar(discordUser);
    user.banner = discordUser.bannerURL() ?? null;
    user.banner_color = discordUser.displayHexColor ?? '#fff';
    user.first_joined_at ??= discordUser.joinedAt ?? new Date();
    await this.save(user);
  }

  async addExperience(user: UserEntity, amount: number): Promise<void> {
    user.experience += amount;
    await this.save(user);
  }

  async addReputation(user: UserEntity, amount: number): Promise<void> {
    user.reputation += amount;
    await this.save(user);
  }

  async addVoiceTime(user: UserEntity, amount: number): Promise<void> {
    user.voice_time += amount;
    await this.save(user);
  }

  async leaveGuild(user: UserEntity): Promise<void> {
    user.left_at = new Date();
    user.is_left_guild = true;
    user.left_count += 1;
    await this.save(user);
  }

  async rejoinGuild(user: UserEntity): Promise<void> {
    user.left_at = null;
    user.is_left_guild = false;
    await this.save(user);
    await this.loadRoles(user);
  }

  async saveRoles(user: UserEntity, discordRoles: Collection<string, Role>) {
    const guild = await this.client.guilds.fetch(user.guild_id.toString());
    if (!guild) return;

    const savedRoles = await this.userRoleRepository.find({
      user_id: user.user_id,
      guild_id: user.guild_id,
    });

    for (const role of savedRoles) {
      if (!discordRoles.has(role.role_id.toString())) {
        this.em.remove(role);
      }
    }

    for (const role of discordRoles.values()) {
      if (role.name === '@everyone') continue;
      if (role.tags) continue; /// Skip bot roles

      const existing = savedRoles.find((r) => r.role_id === BigInt(role.id));
      if (existing) continue;

      const newRole = new UserRoleEntity();
      newRole.user_id = user.user_id;
      newRole.guild_id = user.guild_id;
      newRole.role_id = BigInt(role.id);
      this.em.persist(newRole);
    }

    await this.em.flush();
  }

  async loadRoles(user: UserEntity) {
    const roles = await this.userRoleRepository.find({
      user_id: user.user_id,
      guild_id: user.guild_id,
    });

    const guild = await this.client.guilds.fetch(user.guild_id.toString());
    if (!guild) return;

    for (const role of roles) {
      const discordRole = await guild.roles.fetch(role.role_id.toString());
      if (!discordRole) continue;

      const member = await guild.members
        .fetch(user.user_id.toString())
        .catch(() => null);
      if (!member) continue;

      if (!member.roles.cache.has(discordRole.id)) {
        await member.roles.add(discordRole);
      }
    }
  }

  async updateLastActiveAt(user: UserEntity): Promise<void> {
    user.lastActiveAt = new Date();
    await this.save(user);
  }

  async increaseActiveStreak(user: UserEntity): Promise<void> {
    user.activeStreak += 1;
    await this.save(user);
  }

  async giveRoleToUser(user: UserEntity, roleId: DiscordID): Promise<void> {
    const guild = await this.client.guilds.fetch(user.guild_id.toString());
    if (!guild) return;
    const discordUser = await guild.members
      .fetch(user.user_id.toString())
      .catch(() => null);
    if (!discordUser) return;

    const role = await guild.roles.fetch(roleId.toString());
    if (!role) return;

    if (!discordUser.roles.cache.has(role.id)) {
      await discordUser.roles.add(role);
    }
  }

  async removeRoleFromUser(user: UserEntity, roleId: DiscordID): Promise<void> {
    const guild = await this.client.guilds.fetch(user.guild_id.toString());
    if (!guild) return;
    const discordUser = await guild.members
      .fetch(user.user_id.toString())
      .catch(() => null);
    if (!discordUser) return;

    const role = await guild.roles.fetch(roleId.toString());
    if (!role) return;

    if (discordUser.roles.cache.has(role.id)) {
      await discordUser.roles.remove(role);
    }
  }

  async getTopUsersByField(
    guildId: DiscordID,
    field: keyof UserEntity,
    limit: number,
  ): Promise<UserEntity[]> {
    return this.userRepository.find(
      { guild_id: BigInt(guildId), [field]: { $gt: 0 } },
      {
        orderBy: { [field]: 'DESC' },
        limit,
      },
    );
  }

  async setBirthday(user: UserEntity, birthday: Date | null): Promise<void> {
    user.birth_date = birthday;
    await this.save(user);
  }

  async getBirthdayUsers(
    guild_id: DiscordID,
    month: number,
    day: number,
  ): Promise<UserEntity[]> {
    const qb = this.userRepository.createQueryBuilder('u');
    qb.where({ guild_id: BigInt(guild_id) });
    qb.andWhere('EXTRACT(MONTH FROM u.birth_date) = ?', [month]);
    qb.andWhere('EXTRACT(DAY FROM u.birth_date) = ?', [day]);
    return qb.getResult();
  }

  async getUsersWithBirthdaySet(guild_id: DiscordID) {
    return this.userRepository.find({
      guild_id: BigInt(guild_id),
      birth_date: { $ne: null },
    });
  }
}
