import { Injectable, Logger } from '@nestjs/common';
import { Client, EmbedBuilder, GuildMember } from 'discord.js';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import {
  MahoragaMessageCleanupSummary,
  MahoragaSoftbanResult,
} from './mahoraga.types';
import { MahoragaCaseService } from './mahoraga-case.service';

const DELETE_MESSAGE_SECONDS = 60 * 60;
const TEMPORARY_BAN_DURATION_MS = 5_000;

@Injectable()
export class MahoragaDiscordService {
  private readonly logger = new Logger(MahoragaDiscordService.name);

  constructor(
    private readonly discord: Client,
    private readonly guildSettings: GuildSettingsService,
    private readonly caseService: MahoragaCaseService,
  ) {}

  async applySoftbanToGuild(
    userId: string,
    guildId: string,
    reason = 'Mahoraga softban',
  ): Promise<MahoragaSoftbanResult> {
    this.caseService.parseDiscordId(userId);
    this.caseService.parseDiscordId(guildId);

    const enabled = await this.guildSettings.getSetting<boolean>(
      guildId,
      GuildSettings.MahoragaEnabled,
      false,
    );
    if (!enabled) {
      return { guildId, status: 'failed', detail: 'mahoraga disabled' };
    }

    try {
      const guild = await this.discord.guilds.fetch(guildId);
      try {
        await guild.bans.create(userId, {
          reason,
          deleteMessageSeconds: DELETE_MESSAGE_SECONDS,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return { guildId, status: 'failed', detail: `ban failed: ${detail}` };
      }

      await this.waitForTemporaryBanDuration();

      try {
        await guild.bans.remove(userId, `${reason}: temporary ban expired`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          guildId,
          status: 'failed',
          detail: `unban failed: ${detail}`,
        };
      }

      return { guildId, status: 'applied' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to apply softban in guild ${guildId}:`, error);
      return { guildId, status: 'failed', detail };
    }
  }

  async verifyAndDeleteUserMessages(
    guildId: string,
    entries: Array<{ channelId: string; messageId: string }>,
  ): Promise<{
    summary: MahoragaMessageCleanupSummary;
    resolvedEntries: Array<{ channelId: string; messageId: string }>;
  }> {
    const summary: MahoragaMessageCleanupSummary = {
      alreadyDeleted: 0,
      manuallyDeleted: 0,
      failed: 0,
    };
    const resolvedEntries: Array<{ channelId: string; messageId: string }> = [];

    if (entries.length === 0) return { summary, resolvedEntries };

    let guild;
    try {
      guild = await this.discord.guilds.fetch(guildId);
    } catch (error) {
      this.logger.warn(
        `Could not fetch guild ${guildId} for Mahoraga cleanup: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      summary.failed = entries.length;
      return { summary, resolvedEntries };
    }

    for (const entry of entries) {
      try {
        const channel = await guild.channels
          .fetch(entry.channelId)
          .catch(() => null);
        if (!channel) {
          summary.alreadyDeleted += 1;
          resolvedEntries.push(entry);
          continue;
        }
        if (!channel.isTextBased()) {
          summary.failed += 1;
          continue;
        }

        const message = await channel.messages
          .fetch(entry.messageId)
          .catch(() => null);
        if (!message) {
          summary.alreadyDeleted += 1;
          resolvedEntries.push(entry);
          continue;
        }

        await message.delete();
        summary.manuallyDeleted += 1;
        resolvedEntries.push(entry);
      } catch (error) {
        this.logger.warn(
          `Could not delete Mahoraga message ${entry.messageId} in guild ${guildId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        summary.failed += 1;
      }
    }

    return { summary, resolvedEntries };
  }

  async deleteUserMessages(
    guildId: string,
    entries: Array<{ channelId: string; messageId: string }>,
  ): Promise<void> {
    for (const { channelId, messageId } of entries) {
      try {
        const guild = await this.discord.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased()) continue;

        const message = await channel.messages
          .fetch(messageId)
          .catch(() => null);
        if (message) await message.delete().catch(() => {});
      } catch {
        // ignore
      }
    }
  }

  async handleMemberJoin(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    const mahoragaCase = await this.caseService.getActiveCaseByUserId(
      member.id,
    );
    if (!mahoragaCase) return;

    await this.logEvent(
      member.guild.id,
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('Mahoraga Rejoin')
        .setDescription('User with an active Mahoraga case joined the guild.')
        .addFields(
          { name: 'User', value: `<@${member.id}>`, inline: true },
          { name: 'Reason', value: mahoragaCase.reason, inline: true },
        )
        .setTimestamp(),
    );
  }

  async logEvent(guildId: string, embed: EmbedBuilder): Promise<void> {
    const logChannelId = await this.guildSettings.getSetting<string>(
      guildId,
      GuildSettings.MahoragaLogChannelId,
      null,
    );
    if (!logChannelId) return;

    try {
      const guild = await this.discord.guilds.fetch(guildId);
      const channel = await guild.channels
        .fetch(logChannelId)
        .catch(() => null);
      if (!channel?.isSendable()) return;

      await channel.send({ embeds: [embed] });
    } catch (error) {
      this.logger.warn(
        `Could not send Mahoraga log to guild ${guildId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private waitForTemporaryBanDuration(): Promise<void> {
    return Bun.sleep(TEMPORARY_BAN_DURATION_MS);
  }
}
