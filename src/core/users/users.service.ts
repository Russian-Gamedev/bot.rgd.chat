import { raw } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Client } from 'discord.js';

import { getDefaultAvatar, getDisplayAvatar, noop } from '#lib/utils';
import { DiscordID } from '#root/lib/types';

import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserProfileEntity)
    private readonly userRepository: EntityRepository<UserProfileEntity>,
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
  ) {}

  async findOrCreateMember(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<MemberProfileEntity> {
    guildId = BigInt(guildId);
    userId = BigInt(userId);

    await this.findOrCreateProfile(userId);

    let guildUser = await this.memberProfileRepository.findOne({
      user_id: userId,
      guild_id: guildId,
    });

    if (!guildUser) {
      guildUser = new MemberProfileEntity();
      guildUser.user_id = userId;
      guildUser.guild_id = guildId;
      guildUser.firstJoinedAt = new Date();
      await this.save(guildUser);
      await this.syncDiscordProfile(guildUser).catch(noop);
    } else {
      const profile = await this.getProfile(userId);
      if (!profile?.avatar_url || isDefaultAvatar(profile.avatar_url)) {
        await this.syncDiscordProfile(guildUser).catch(noop);
      }
    }

    return guildUser;
  }

  async findOrCreate(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<MemberProfileEntity> {
    return this.findOrCreateMember(guildId, userId);
  }

  async findOrCreateProfile(userId: DiscordID): Promise<UserProfileEntity> {
    const normalizedUserId = BigInt(userId);
    let user = await this.userRepository.findOne({ user_id: normalizedUserId });
    if (user) return user;

    user = new UserProfileEntity();
    user.user_id = normalizedUserId;
    user.username = '';
    user.nickname = null;
    user.avatar_url = getDefaultAvatar(normalizedUserId.toString());
    user.banner = null;
    user.banner_alt = null;
    user.banner_color = '#fff';
    user.firstJoinedAt = new Date();
    user.about = null;
    user.birthDate = null;
    user.lastActiveAt = new Date();

    await this.save(user);
    return user;
  }

  async getProfile(userId: DiscordID): Promise<UserProfileEntity | null> {
    return this.userRepository.findOne({ user_id: BigInt(userId) });
  }

  async save(entity: UserProfileEntity | MemberProfileEntity): Promise<void> {
    await this.em.persist(entity).flush();
  }

  async getMemberProfiles(user_id: DiscordID): Promise<MemberProfileEntity[]> {
    return this.memberProfileRepository.find({ user_id: BigInt(user_id) });
  }

  async getNewUsers(
    since: Date,
    guildId: DiscordID,
  ): Promise<MemberProfileEntity[]> {
    return this.memberProfileRepository.find({
      firstJoinedAt: { $gte: since },
      guild_id: BigInt(guildId),
      isLeftGuild: false,
    });
  }

  async syncDiscordProfile(guildUser: MemberProfileEntity): Promise<void> {
    const guild = await this.client.guilds.fetch(guildUser.guild_id.toString());
    if (!guild) return;

    const userId = guildUser.user_id.toString();
    const discordUser = await guild.members
      .fetch({ user: userId, force: true })
      .catch(() => guild.members.cache.get(userId));
    if (!discordUser) return;

    const user = await this.findOrCreateProfile(guildUser.user_id);
    user.username = discordUser.user.username;
    user.nickname = discordUser.nickname;
    user.avatar_url = getDisplayAvatar(discordUser);
    user.banner = discordUser.bannerURL() ?? null;
    user.banner_color = discordUser.displayHexColor ?? '#fff';
    user.firstJoinedAt =
      user.firstJoinedAt && discordUser.joinedAt
        ? minDate(user.firstJoinedAt, discordUser.joinedAt)
        : (user.firstJoinedAt ?? discordUser.joinedAt ?? new Date());

    guildUser.firstJoinedAt ??= discordUser.joinedAt ?? new Date();

    this.em.persist(user);
    this.em.persist(guildUser);
    await this.em.flush();
  }

  async refreshUsersData(batchSize = 50): Promise<{
    refreshed: number;
    failed: number;
  }> {
    let lastId = 0n;
    let refreshed = 0;
    let failed = 0;

    while (true) {
      const users = await this.memberProfileRepository.find(
        {
          id: { $gt: lastId },
          isLeftGuild: false,
        },
        {
          limit: batchSize,
          orderBy: { id: 'asc' },
        },
      );

      if (users.length === 0) break;

      for (const user of users) {
        lastId = user.id;

        try {
          await this.syncDiscordProfile(user);
          refreshed++;
        } catch {
          failed++;
        }
      }
    }

    return { refreshed, failed };
  }

  async addExperience(
    user: MemberProfileEntity,
    amount: number,
  ): Promise<void> {
    await this.findOrCreateProfile(user.user_id);
    await this.userRepository.nativeUpdate(
      { user_id: BigInt(user.user_id) },
      { experience: raw('experience + ?', [amount]) },
    );
  }

  async addReputation(
    user: MemberProfileEntity,
    amount: number,
  ): Promise<void> {
    await this.findOrCreateProfile(user.user_id);
    await this.userRepository.nativeUpdate(
      { user_id: BigInt(user.user_id) },
      { reputation: raw('reputation + ?', [amount]) },
    );
  }

  async leaveGuild(user: MemberProfileEntity): Promise<void> {
    user.leftAt = new Date();
    user.isLeftGuild = true;
    user.leftCount += 1;
    await this.save(user);
  }

  async rejoinGuild(user: MemberProfileEntity): Promise<void> {
    user.leftAt = null;
    user.isLeftGuild = false;
    await this.save(user);
  }

  async setBirthday(
    user: UserProfileEntity | MemberProfileEntity,
    birthday: Date | null,
  ): Promise<void> {
    const profile =
      user instanceof UserProfileEntity
        ? user
        : await this.findOrCreateProfile(user.user_id);
    profile.birthDate = birthday;
    await this.save(profile);
  }

  async getBirthdayUsers(
    guild_id: DiscordID,
    month: number,
    day: number,
  ): Promise<UserProfileEntity[]> {
    return this.userRepository
      .createQueryBuilder('u')
      .where(
        raw(
          'EXISTS (SELECT 1 FROM member_profiles m WHERE m.user_id = u.user_id AND m.guild_id = ? AND m.is_left_guild = false)',
          [BigInt(guild_id)],
        ),
      )
      .andWhere(raw('EXTRACT(MONTH FROM u.birth_date) = ?', [month]))
      .andWhere(raw('EXTRACT(DAY FROM u.birth_date) = ?', [day]))
      .getResult();
  }

  async getUsersWithBirthdaySet(guild_id: DiscordID) {
    return this.userRepository
      .createQueryBuilder('u')
      .where(
        raw(
          'EXISTS (SELECT 1 FROM member_profiles m WHERE m.user_id = u.user_id AND m.guild_id = ? AND m.is_left_guild = false)',
          [BigInt(guild_id)],
        ),
      )
      .andWhere({ birthDate: { $ne: null } })
      .getResult();
  }
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function isDefaultAvatar(avatar: string): boolean {
  return avatar.includes('/embed/avatars/');
}
