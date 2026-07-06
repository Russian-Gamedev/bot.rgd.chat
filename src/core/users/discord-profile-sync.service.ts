import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Client, Collection, GuildMember, User } from 'discord.js';

import {
  getDefaultAvatar,
  getDisplayAvatar,
  getDisplayBanner,
} from '#lib/utils';
import { DiscordID } from '#root/lib/types';

import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileEntity } from './entities/user-profile.entity';

const DEFAULT_SYNC_CONCURRENCY = 10;
const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface EnsureMemberProfileResult {
  member: MemberProfileEntity;
  created: boolean;
}

@Injectable()
export class DiscordProfileSyncService {
  constructor(
    @InjectRepository(UserProfileEntity)
    private readonly userRepository: EntityRepository<UserProfileEntity>,
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
  ) {}

  async syncUser(discordUser: User): Promise<UserProfileEntity> {
    const userId = BigInt(discordUser.id);
    const user = await this.em.upsert(
      UserProfileEntity,
      {
        user_id: userId,
        username: discordUser.username,
        nickname: null,
        avatar_url: getDisplayAvatar(discordUser),
        banner: getDisplayBanner(discordUser) ?? null,
        banner_alt: null,
        banner_color: discordUser.hexAccentColor ?? '#fff',
        firstJoinedAt: new Date(),
        about: null,
        profileInfo: {},
        birthDate: null,
        lastActiveAt: new Date(),
      },
      {
        onConflictFields: ['user_id'],
        onConflictMergeFields: [
          'username',
          'avatar_url',
          'banner',
          'banner_color',
        ],
      },
    );

    return user;
  }

  async syncMember(member: GuildMember): Promise<MemberProfileEntity> {
    const user = await this.syncUser(member.user);
    const userId = BigInt(member.user.id);
    const guildId = BigInt(member.guild.id);
    const joinedAt = member.joinedAt ?? new Date();

    const guildUser = await this.em.upsert(
      MemberProfileEntity,
      {
        user_id: userId,
        guild_id: guildId,
        nickname: member.nickname,
        avatar_url: getDisplayAvatar(member),
        banner: member.bannerURL() ?? null,
        display_color: member.displayHexColor,
        firstJoinedAt: joinedAt,
        isLeftGuild: false,
        leftAt: null,
      },
      {
        onConflictFields: ['user_id', 'guild_id'],
        onConflictMergeFields: [
          'nickname',
          'avatar_url',
          'banner',
          'display_color',
          'isLeftGuild',
          'leftAt',
        ],
      },
    );

    if (user.firstJoinedAt && joinedAt < user.firstJoinedAt) {
      user.firstJoinedAt = joinedAt;
      await this.em.flush();
    }

    if (guildUser.firstJoinedAt && joinedAt < guildUser.firstJoinedAt) {
      guildUser.firstJoinedAt = joinedAt;
      await this.em.flush();
    }

    return guildUser;
  }

  async syncGuildMemberById(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<MemberProfileEntity | null> {
    const guild = await this.client.guilds.fetch(guildId.toString());
    const member = await guild.members
      .fetch({ user: userId.toString(), force: true })
      .catch(() => guild.members.cache.get(userId.toString()) ?? null);
    if (!member) return null;

    return this.syncMember(member);
  }

  async syncUsersById(
    userIds: DiscordID[],
    concurrency = DEFAULT_SYNC_CONCURRENCY,
    options: { staleAfterMs?: number } = {},
  ): Promise<void> {
    const syncableUserIds = await this.getSyncableUserIds(
      userIds,
      options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
    );

    await runLimited(syncableUserIds, concurrency, async (userId) => {
      const user = await this.client.users.fetch(userId.toString(), {
        force: true,
      });
      await this.syncUser(user);
    });
  }

  async syncMembers(
    members: Collection<string, GuildMember> | GuildMember[],
    concurrency = DEFAULT_SYNC_CONCURRENCY,
  ): Promise<void> {
    await runLimited([...members.values()], concurrency, (member) =>
      this.syncMember(member),
    );
  }

  async ensureUserProfile(userId: DiscordID): Promise<UserProfileEntity> {
    const normalizedUserId = BigInt(userId);
    await this.em.upsert(
      UserProfileEntity,
      this.createDefaultProfileData(normalizedUserId),
      {
        onConflictFields: ['user_id'],
        onConflictAction: 'ignore',
      },
    );

    return this.userRepository.findOneOrFail({ user_id: normalizedUserId });
  }

  async ensureMemberProfile(
    guildId: DiscordID,
    userId: DiscordID,
  ): Promise<EnsureMemberProfileResult> {
    const normalizedGuildId = BigInt(guildId);
    const normalizedUserId = BigInt(userId);

    const existing = await this.memberProfileRepository.findOne({
      user_id: normalizedUserId,
      guild_id: normalizedGuildId,
    });
    if (existing) return { member: existing, created: false };

    await this.ensureUserProfile(normalizedUserId);
    await this.em.upsert(
      MemberProfileEntity,
      {
        user_id: normalizedUserId,
        guild_id: normalizedGuildId,
        firstJoinedAt: new Date(),
      },
      {
        onConflictFields: ['user_id', 'guild_id'],
        onConflictAction: 'ignore',
      },
    );

    const member = await this.memberProfileRepository.findOneOrFail({
      user_id: normalizedUserId,
      guild_id: normalizedGuildId,
    });

    return { member, created: true };
  }

  private async getSyncableUserIds(
    userIds: DiscordID[],
    staleAfterMs: number,
  ): Promise<bigint[]> {
    const uniqueUserIds = [...new Set(userIds.map((userId) => BigInt(userId)))];
    if (uniqueUserIds.length === 0) return [];

    const existingUsers = await this.userRepository.find({
      user_id: { $in: uniqueUserIds },
    });
    const existingById = new Map(
      existingUsers.map((user) => [user.user_id.toString(), user]),
    );
    const staleBefore = Date.now() - staleAfterMs;

    return uniqueUserIds.filter((userId) => {
      const user = existingById.get(userId.toString());
      if (!user) return true;
      return user.updatedAt.getTime() < staleBefore;
    });
  }

  private createDefaultProfileData(userId: bigint) {
    return {
      user_id: userId,
      username: '',
      nickname: null,
      avatar_url: getDefaultAvatar(userId.toString()),
      banner: null,
      banner_alt: null,
      banner_color: '#fff',
      firstJoinedAt: new Date(),
      about: null,
      profileInfo: {},
      birthDate: null,
      lastActiveAt: new Date(),
    };
  }
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<unknown>,
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) continue;
        await worker(item);
      }
    }),
  );
}
