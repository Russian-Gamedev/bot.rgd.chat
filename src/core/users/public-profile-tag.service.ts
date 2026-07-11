import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { Client, type Role } from 'discord.js';

import { DiscordID } from '#root/lib/types';
import { MemberProfileEntity } from './entities/member-profile.entity';
import { UserProfileTagEntity } from './entities/user-profile-tag.entity';

export interface PublicUserProfileTag {
  name: string;
  color: string;
  background: string;
  description: string;
}

const PATRON_API = 'https://thanks.rgd.chat/api/supporters';
const PATRON_TAG_COLOR = '#5C87E7';
const PATRON_TAG_BACKGROUND = '#FEFEFE';
const PATRON_TAG_DESCRIPTION = 'Донат';

interface SupporterDto {
  user: {
    id: string;
    username: string;
    avatar_url: string;
    banner: string;
  };
  value: number;
}

@Injectable()
export class PublicProfileTagService {
  constructor(
    @InjectRepository(MemberProfileEntity)
    private readonly memberProfileRepository: EntityRepository<MemberProfileEntity>,
    @InjectRepository(UserProfileTagEntity)
    private readonly userProfileTagRepository: EntityRepository<UserProfileTagEntity>,
    private readonly client: Client,
  ) {}

  async getPublicProfileTags(
    userId: DiscordID,
  ): Promise<PublicUserProfileTag[]> {
    const user_id = BigInt(userId);
    const tags: PublicUserProfileTag[] = [];
    const roleTags = await this.getRoleTags(user_id);
    const patronTag = await this.getPatronTag(user_id);

    tags.push(...roleTags);

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
    try {
      const response = await fetch(PATRON_API);
      if (!response.ok) return null;

      const supporters: SupporterDto[] = await response.json();
      const patron = supporters.find((s) => s.user.id === String(userId));

      if (!patron || patron.value <= 0) return null;

      return {
        name: formatDonation(patron.value),
        color: PATRON_TAG_COLOR,
        background: PATRON_TAG_BACKGROUND,
        description: PATRON_TAG_DESCRIPTION,
      };
    } catch {
      return null;
    }
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

  return luminance > 0.8 ? '#000000' : '#ffffff';
}

function formatDonation(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
