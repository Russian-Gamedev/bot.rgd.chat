import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client } from 'discord.js';
import Redis from 'ioredis';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(
    private readonly client: Client,
    private readonly redis: Redis,
  ) {}

  public async getEmojiImage(emoji: string, size = 128) {
    const emojiId = this.client.emojis.cache.find((e) => e.name === emoji);
    if (!emojiId) return null;
    return emojiId.imageURL({ animated: true, extension: 'webp', size });
  }

  public async getMembersStats() {
    if (!this.client.isReady()) {
      this.logger.warn('Discord client is not ready');
      return { total: 0, online: 0 };
    }

    const key = 'discord:member_stats';
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const guilds = this.client.guilds.cache;
    let totalMembers = 0;
    let onlineMembers = 0;
    for (const guild of guilds.values()) {
      try {
        const members = await guild.members.fetch();
        totalMembers += members.size;
        onlineMembers += members.filter(
          (member) => member.presence?.status === 'online',
        ).size;
      } catch (error) {
        this.logger.warn(
          `Failed to fetch members for guild ${guild.id}: ${String(error)}`,
        );
      }
    }

    const response = {
      total: totalMembers,
      online: onlineMembers,
    };

    await this.redis.set(key, JSON.stringify(response), 'EX', 60 * 60);

    return response;
  }

  public async getInviteInfo(code: string) {
    const invite = await this.client.fetchInvite(code).catch(() => null);
    if (!invite) throw new NotFoundException('Invite not found');
    if (!invite.guild)
      throw new NotFoundException('Invite does not belong to a guild');

    const guild = await this.client.guilds
      .fetch(invite.guild.id)
      .catch(() => null);
    if (!guild) throw new NotFoundException('Guild not found');

    return {
      code,
      title: invite.guild.name,
      description: invite.guild.description,
      memberCount: invite.memberCount,
      presenceCount: invite.presenceCount,
      expiresAt: invite.expiresAt,
      url: `https://discord.gg/${code}`,
      icon_url: invite.guild.iconURL({ extension: 'webp', size: 128 }),
      banner_url: invite.guild.bannerURL({ extension: 'webp', size: 512 }),
    };
  }
}
