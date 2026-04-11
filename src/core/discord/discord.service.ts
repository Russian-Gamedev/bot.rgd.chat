import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Client, SnowflakeUtil } from 'discord.js';
import Redis from 'ioredis';
import { Once } from 'necord';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(
    private readonly client: Client,
    private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    const commands = await fetch(
      'https://discord.com/api/v10/applications/' + clientId + '/commands',
      {
        method: 'GET',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
      },
    ).then((res) => res.json());

    const oldCommands: string[][] = [];

    const deleteAfter = 1000 * 60 * 60 * 24 * 7; // 7 days ago

    for (const cmd of commands) {
      const version = SnowflakeUtil.decode(cmd.version);
      const diff = Date.now() - Number(version.timestamp);
      if (diff > deleteAfter) {
        oldCommands.push([cmd.id, cmd.name]);
      }
    }

    const launchBarCommand = commands.find(
      (cmd) => cmd.name === 'launch' || cmd.name === 'launch-bar',
    );
    if (launchBarCommand) {
      oldCommands.push([launchBarCommand.id, launchBarCommand.name]);
    }

    this.logger.warn(`Found ${oldCommands.length} old commands to delete`);

    for (const [cmdId, cmdName] of oldCommands) {
      await fetch(
        'https://discord.com/api/v10/applications/' +
          clientId +
          '/commands/' +
          cmdId,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
          },
        },
      ).then((res) => res.json());

      this.logger.warn(
        `Deleted command with ID: ${cmdId} and name: ${cmdName}`,
      );
    }
  }

  @Once('clientReady')
  public async onReady() {
    await Bun.sleep(5000); // wait for discord cache to stabilize before registering commands
    await this.client.application?.commands
      .create({
        name: 'launch',
        description: 'Start rgdbar',
        type: 4,
        handler: 2,
        integration_types: [0],
        contexts: [0],
      })
      .catch((err) => {
        this.logger.error('Failed to create application command:', err);
      });
    this.logger.log('Registered /launch command');
  }

  public async getEmojiImage(emoji: string, size = 128) {
    const emojiId = this.client.emojis.cache.find((e) => e.name === emoji);
    if (!emojiId) return null;
    return emojiId.imageURL({ animated: true, extension: 'webp', size });
  }

  public async getMembersStats() {
    const cached = await this.redis.get('discord:members_stats');
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
      await Bun.sleep(100);
    }

    const response = {
      total: totalMembers,
      online: onlineMembers,
    };

    await this.redis.set(
      'discord:members_stats',
      JSON.stringify(response),
      'EX',
      300,
    );

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
