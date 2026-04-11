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
    await this.cleanUnusedCommands();
  }

  @Once('clientReady')
  public async onReady() {
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

  private async cleanUnusedCommands() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const deleteAfter = 1000 * 60 * 60 * 24; // 1 day

    const baseUrl = `https://discord.com/api/v10/applications/${clientId}`;
    const headers = {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    };

    const isOldOrLaunch = (cmd: {
      id: string;
      name: string;
      version: string;
    }) => {
      if (cmd.name === 'launch' || cmd.name === 'launch-bar') return true;
      const diff =
        Date.now() - Number(SnowflakeUtil.decode(cmd.version).timestamp);
      return diff > deleteAfter;
    };

    interface Command {
      id: string;
      name: string;
      version: string;
    }

    // Global commands
    const globalCommands: Command[] = await fetch(`${baseUrl}/commands`, {
      method: 'GET',
      headers,
    }).then((res) => res.json());

    const oldGlobal = globalCommands.filter(isOldOrLaunch);
    this.logger.warn(`Found ${oldGlobal.length} old global commands to delete`);

    for (const cmd of oldGlobal) {
      await fetch(`${baseUrl}/commands/${cmd.id}`, {
        method: 'DELETE',
        headers,
      });
      this.logger.warn(`Deleted global command "${cmd.name}" (${cmd.id})`);
    }

    // Guild commands — fetch via REST since guilds.cache is not available before clientReady
    const botGuilds: { id: string }[] = await fetch(
      'https://discord.com/api/v10/users/@me/guilds',
      { method: 'GET', headers },
    ).then((res) => res.json());

    if (!Array.isArray(botGuilds)) return;

    for (const { id: guildId } of botGuilds) {
      const guildCommands: Command[] = await fetch(
        `${baseUrl}/guilds/${guildId}/commands`,
        {
          method: 'GET',
          headers,
        },
      ).then((res) => res.json());

      if (!Array.isArray(guildCommands)) continue;

      const oldGuild = guildCommands.filter(isOldOrLaunch);
      if (oldGuild.length === 0) continue;

      this.logger.warn(
        `Found ${oldGuild.length} old guild commands to delete in guild ${guildId}`,
      );

      for (const cmd of oldGuild) {
        await fetch(`${baseUrl}/guilds/${guildId}/commands/${cmd.id}`, {
          method: 'DELETE',
          headers,
        });
        this.logger.warn(
          `Deleted guild command "${cmd.name}" (${cmd.id}) from guild ${guildId}`,
        );
      }
    }
  }
}
