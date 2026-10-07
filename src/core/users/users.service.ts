import { raw } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import {
  assertPositiveInteger,
  formatError,
  hasOwn,
  isObject,
  isUnsignedInteger,
} from '#lib/utils';
import type { DiscordID } from '#root/lib/types';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import type { PatchCurrentUserProfileDto } from './dto/patch-current-user-profile.dto';
import { UserSearchResultDto } from './dto/user-search-result.dto';
import { MemberProfileEntity } from './entities/member-profile.entity';
import {
  UserProfileEntity,
  type UserProfileInfo,
} from './entities/user-profile.entity';
import { normalizePublicProfileInfo } from './normalizers/public-profile-info.normalizer';

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

  /**
   * Fuzzy-поиск для autocomplete: username и nickname по trigram-сходству,
   * а числовой ввод — по префиксу id. Выражения в WHERE совпадают с
   * выражениями trgm-индексов, чтобы планировщик использовал их.
   */
  async searchProfiles(
    query: string,
    limit = 5,
  ): Promise<UserSearchResultDto[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      return [];
    }

    // execute с mode 'all' возвращает массив строк; обобщённый тип в v7
    // описывает одну строку, поэтому приводим результат вручную.
    // Ранжирование: word_similarity + similarity + бонус за префикс, точное
    // совпадение id всегда первое.
    const rows = (await this.em.execute(
      `select c.user_id, c.username, c.nickname, c.avatar_url
       from (
         select u.user_id, u.username, u.nickname, u.avatar_url
         from users u
         where lower(u.username) %> ? or lower(u.nickname) %> ?
         union
         select u.user_id, u.username, u.nickname, u.avatar_url
         from users u
         where u.user_id::text like ? || '%'
       ) c
       order by
         (c.user_id::text = ?) desc,
         greatest(
           word_similarity(?, lower(c.username))
             + similarity(?, lower(c.username))
             + (case when lower(c.username) like ? || '%' then 0.5 else 0 end),
           word_similarity(?, lower(coalesce(c.nickname, '')))
             + similarity(?, lower(coalesce(c.nickname, '')))
             + (case when lower(coalesce(c.nickname, '')) like ? || '%'
                     then 0.5 else 0 end)
         ) desc,
         lower(c.username) asc,
         c.user_id asc
       limit ?`,
      [q, q, q, q, q, q, q, q, q, q, limit],
      'all',
    )) as {
      user_id: string;
      username: string;
      nickname: string | null;
      avatar_url: string;
    }[];

    return rows.map(toSearchResultDto);
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

    if (hasOwn(dto, 'activityPublic')) {
      profile.activityPublic = dto.activityPublic ?? false;
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

  async incrementBanCount(userId: DiscordID): Promise<void> {
    await this.findOrCreateProfile(userId);
    await this.userRepository.nativeUpdate(
      { user_id: BigInt(userId) },
      { banCount: raw('ban_count + 1') },
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

  async syncUserProfileFromDiscord(
    userId: DiscordID,
  ): Promise<UserProfileEntity | null> {
    try {
      return await this.discordProfileSync.syncUserById(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to sync Discord user profile ${String(userId)}: ${formatError(error)}`,
      );
      return null;
    }
  }
}

function isDefaultAvatar(avatar: string): boolean {
  return avatar.includes('/embed/avatars/');
}

function toSearchResultDto(row: {
  user_id: string;
  username: string;
  nickname: string | null;
  avatar_url: string;
}): UserSearchResultDto {
  return plainToInstance(
    UserSearchResultDto,
    {
      id: row.user_id,
      username: row.username,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
    },
    { excludeExtraneousValues: true },
  );
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
