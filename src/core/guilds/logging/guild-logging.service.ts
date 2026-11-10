import { Injectable, Logger } from '@nestjs/common';
import { Client, EmbedBuilder, SendableChannels } from 'discord.js';

import { GuildSettings } from '#config/guilds';
import type { DiscordID } from '#root/lib/types';

import { GuildSettingsService } from '../settings/guild-settings.service';

@Injectable()
export class GuildLoggingService {
  private readonly logger = new Logger(GuildLoggingService.name);

  constructor(
    private readonly guildSettingsService: GuildSettingsService,
    private readonly discord: Client,
  ) {}

  async getLogChannel(guildId: DiscordID): Promise<SendableChannels | null> {
    const channelId = await this.guildSettingsService.getSetting<string>(
      guildId,
      GuildSettings.AuditLogChannel,
      null,
    );
    if (!channelId) return null;

    const guild = await this.discord.guilds
      .fetch(String(guildId))
      .catch(() => null);
    if (!guild) return null;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) return null;

    return channel as SendableChannels;
  }

  /// Sends only the embed and never throws: logging must not break the flow it observes.
  async log(guildId: DiscordID, embed: EmbedBuilder): Promise<void> {
    try {
      const channel = await this.getLogChannel(guildId);
      if (!channel) return;

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.warn(
        `Failed to send log embed to guild ${guildId}: ${error}`,
      );
    }
  }
}
