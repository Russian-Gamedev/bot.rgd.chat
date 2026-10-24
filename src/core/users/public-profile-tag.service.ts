import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Optional } from '@nestjs/common';
import { Client, type Role } from 'discord.js';

import { MetricsService } from '#common/metrics/metrics.service';
import type { DiscordID } from '#root/lib/types';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';
import { PatronTagService } from './patron-tag.service';

export interface PublicUserProfileTag {
  name: string;
  color: string;
  background: string;
  description: string;
}

const ROLE_TAG_SYNC_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class PublicProfileTagService {
  constructor(
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    @InjectRepository(UserProfileTagEntity)
    private readonly userProfileTagRepository: EntityRepository<UserProfileTagEntity>,
    private readonly client: Client,
    private readonly discordProfileSync: DiscordProfileSyncService,
    private readonly patronTagService: PatronTagService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async getPublicProfileTags(
    userId: DiscordID,
  ): Promise<PublicUserProfileTag[]> {
    const user_id = BigInt(userId);
    const [memberships, customTags] = await Promise.all([
      this.memberProfileRepository.find({
        user_id,
        isLeftGuild: false,
      }),
      this.userProfileTagRepository.find(
        { user_id },
        { orderBy: { id: 'ASC' } },
      ),
    ]);
    const [roleTags, patronTag] = await Promise.all([
      this.getRoleTags(memberships),
      this.patronTagService.getTag(userId),
    ]);

    const tags = [...roleTags];

    if (patronTag) {
      tags.push(patronTag);
    }

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

  private async getRoleTags(
    memberships: MemberProfileEntity[],
  ): Promise<PublicUserProfileTag[]> {
    const tags: PublicUserProfileTag[] = [];

    for (const membership of memberships) {
      const role = await this.resolveRole(membership);
      if (role) {
        tags.push(roleToTag(role));
      }
    }

    return tags;
  }

  private async resolveRole(
    membership: MemberProfileEntity,
  ): Promise<Role | null> {
    const syncedAt = membership.roleSyncedAt?.getTime() ?? 0;
    const roleId =
      Date.now() - syncedAt < ROLE_TAG_SYNC_INTERVAL_MS
        ? membership.highestRoleId
        : await this.refreshHighestRoleId(membership);

    if (!roleId) return null;

    const guild = this.client.guilds.cache.get(membership.guild_id.toString());
    return guild?.roles.cache.get(roleId.toString()) ?? null;
  }

  private async refreshHighestRoleId(
    membership: MemberProfileEntity,
  ): Promise<bigint | null> {
    const startedAt = performance.now();

    try {
      const synced = await this.discordProfileSync.syncGuildMemberById(
        membership.guild_id,
        membership.user_id,
        { force: true },
      );

      this.metrics?.recordProfileSync(
        synced ? 'fresh' : 'none',
        (performance.now() - startedAt) / 1000,
      );

      if (synced) {
        return synced.highestRoleId;
      }
    } catch {
      this.metrics?.recordProfileSync(
        'error',
        (performance.now() - startedAt) / 1000,
      );
    }

    return membership.highestRoleId;
  }
}

function roleToTag(role: Role): PublicUserProfileTag {
  const background = /^#[0-9a-fA-F]{6}$/.test(role.hexColor)
    ? role.hexColor
    : '#5865f2';

  return {
    name: role.name,
    color: getContrastColor(background),
    background,
    description: `Роль на сервере ${role.guild.name}`,
  };
}

export function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const linearize = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };

  const luminance =
    0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);

  const threshold = b > r ? 0.2 : 0.8;
  return luminance > threshold ? '#000000' : '#ffffff';
}
