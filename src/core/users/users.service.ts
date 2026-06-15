import { raw } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { DiscordID } from '#root/lib/types';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserProfileEntity)
    private readonly userRepository: EntityRepository<UserProfileEntity>,
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    private readonly em: EntityManager,
    private readonly discordProfileSync: DiscordProfileSyncService,
  ) {}

  async findOrCreateMember(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<MemberProfileEntity> {
    guildId = BigInt(guildId);
    userId = BigInt(userId);

    const { member, created } =
      await this.discordProfileSync.ensureMemberProfile(guildId, userId);

    if (created) {
      await this.syncGuildMemberWithWarning(guildId, userId);
    } else {
      const profile = await this.getProfile(userId);
      if (!profile?.avatar_url || isDefaultAvatar(profile.avatar_url)) {
        await this.syncGuildMemberWithWarning(guildId, userId);
      }
    }

    return member;
  }

  async findOrCreate(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<MemberProfileEntity> {
    return this.findOrCreateMember(guildId, userId);
  }

  async findOrCreateProfile(userId: DiscordID): Promise<UserProfileEntity> {
    return this.discordProfileSync.ensureUserProfile(userId);
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

  async addExperience(
    user: MemberProfileEntity,
    amount: number,
  ): Promise<void> {
    assertPositiveInteger(amount, 'experience');
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
    assertPositiveInteger(amount, 'reputation');
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

  private async syncGuildMemberWithWarning(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<void> {
    try {
      await this.discordProfileSync.syncGuildMemberById(guildId, userId);
    } catch (error) {
      this.logger.warn(
        `Failed to sync Discord guild member ${guildId.toString()}/${userId.toString()}: ${formatError(error)}`,
      );
    }
  }
}

function isDefaultAvatar(avatar: string): boolean {
  return avatar.includes('/embed/avatars/');
}

function assertPositiveInteger(amount: number, field: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new BadRequestException(`Invalid ${field} amount.`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
