import { raw } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Client, type Role } from 'discord.js';

import { PatronEntity } from '#core/patrons/entities/patron.entity';
import { DiscordID } from '#root/lib/types';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import type { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import { MemberProfileEntity } from './entities/member-profile.entity';
import {
  UserProfileEntity,
  type UserProfileInfo,
} from './entities/user-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { normalizePublicProfileInfo } from './normalizers/public-profile-info.normalizer';

export interface PublicUserProfileTag {
  name: string;
  color: string;
  background: string;
  description: string;
}

const PATRON_TAG_COLOR = '#5C87E7';
const PATRON_TAG_BACKGROUND = '#FEFEFE';
const PATRON_TAG_DESCRIPTION = 'Донат';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(UserProfileEntity)
    private readonly userRepository: EntityRepository<UserProfileEntity>,
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    @InjectRepository(PatronEntity)
    private readonly patronRepository: EntityRepository<PatronEntity>,
    @InjectRepository(UserProfileTagEntity)
    private readonly userProfileTagRepository: EntityRepository<UserProfileTagEntity>,
    private readonly em: EntityManager,
    private readonly discordProfileSync: DiscordProfileSyncService,
    private readonly client: Client,
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

  async lookupProfile(lookup: string): Promise<UserProfileEntity | null> {
    const normalizedLookup = lookup.trim();
    if (!normalizedLookup) {
      return null;
    }

    if (isUnsignedInteger(normalizedLookup)) {
      return this.getProfile(normalizedLookup);
    }

    const normalizedName = normalizedLookup.toLowerCase();
    return this.userRepository
      .createQueryBuilder('u')
      .where(raw('lower(u.username) = ?', [normalizedName]))
      .orWhere(raw('lower(u.nickname) = ?', [normalizedName]))
      .limit(1)
      .getSingleResult();
  }

  async getPublicProfileTags(
    userId: DiscordID,
  ): Promise<PublicUserProfileTag[]> {
    const user_id = BigInt(userId);
    const tags = await this.getRoleTags(user_id);
    const patronTag = await this.getPatronTag(user_id);

    if (patronTag) {
      tags.push(patronTag);
    }

    const customTags = await this.userProfileTagRepository.find(
      { user_id },
      { orderBy: { id: 'ASC' } },
    );

    tags.push(
      ...customTags.map((tag) => ({
        name: tag.name,
        color: tag.color,
        background: tag.background,
        description: tag.description,
      })),
    );

    return tags;
  }

  async updateProfileInfo(
    userId: DiscordID,
    dto: PatchCurrentUserProfileDto,
  ): Promise<UserProfileEntity> {
    const profile = await this.findOrCreateProfile(userId);

    if (hasOwn(dto, 'bannerAlt')) {
      profile.banner_alt = dto.bannerAlt ?? null;
    }

    if (hasOwn(dto, 'birthDate')) {
      profile.birthDate = dto.birthDate ?? null;
    }

    if (dto.info) {
      profile.profileInfo = mergeProfileInfoPatch(
        profile.profileInfo,
        dto.info,
      );
    }

    await this.save(profile);
    return profile;
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
          'EXISTS (SELECT 1 FROM guild_users m WHERE m.user_id = u.user_id AND m.guild_id = ? AND m.is_left_guild = false)',
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
          'EXISTS (SELECT 1 FROM guild_users m WHERE m.user_id = u.user_id AND m.guild_id = ? AND m.is_left_guild = false)',
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

  private async getRoleTags(userId: bigint): Promise<PublicUserProfileTag[]> {
    const memberships = await this.memberProfileRepository.find({
      user_id: userId,
      isLeftGuild: false,
    });
    const tags: PublicUserProfileTag[] = [];

    for (const membership of memberships) {
      const guild = await this.client.guilds
        .fetch(membership.guild_id.toString())
        .catch(() => null);
      if (!guild) continue;

      const member = await guild.members
        .fetch(userId.toString())
        .catch(() => null);
      if (!member) continue;

      const role = member.roles.cache
        .filter((role) => role.name !== '@everyone' && !role.tags)
        .sort((left, right) => right.position - left.position)
        .first();
      if (!role) continue;

      tags.push(roleToTag(role));
    }

    return tags;
  }

  private async getPatronTag(
    userId: bigint,
  ): Promise<PublicUserProfileTag | null> {
    const patron = await this.patronRepository.findOne({ user_id: userId });
    if (!patron || patron.value <= 0) return null;

    return {
      name: formatDonation(patron.value),
      color: PATRON_TAG_COLOR,
      background: PATRON_TAG_BACKGROUND,
      description: PATRON_TAG_DESCRIPTION,
    };
  }
}

function isDefaultAvatar(avatar: string): boolean {
  return avatar.includes('/embed/avatars/');
}

function isUnsignedInteger(value: string): boolean {
  return /^\d+$/.test(value);
}

function assertPositiveInteger(amount: number, field: string): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new BadRequestException(`Invalid ${field} amount.`);
  }
}

function mergeProfileInfoPatch(
  current: UserProfileInfo,
  patch: PatchCurrentUserProfileDto['info'],
): UserProfileInfo {
  const next: UserProfileInfo = isObject(current) ? { ...current } : {};

  if (!patch) return next;

  if (hasOwn(patch, 'about')) {
    next.about = normalizePublicProfileInfo({ about: patch.about }).about;
  }

  if (hasOwn(patch, 'links')) {
    next.links = normalizePublicProfileInfo({ links: patch.links }).links;
  }

  return next;
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.hasOwn(value, key);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function roleToTag(role: Role): PublicUserProfileTag {
  return {
    name: role.name,
    color: role.hexColor,
    background: getTagBackground(role.hexColor),
    description: `Роль на сервере ${role.guild.name}`,
  };
}

function getTagBackground(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}29` : '#5865f229';
}

function formatDonation(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
