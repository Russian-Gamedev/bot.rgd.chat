import { Injectable, Logger } from '@nestjs/common';
import { Client, EmbedBuilder, GuildMember } from 'discord.js';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import { MahoragaSoftbanResult } from './mahoraga.types';
import { MahoragaCaseService } from './mahoraga-case.service';

@Injectable()
export class MahoragaDiscordService {
  private readonly logger = new Logger(MahoragaDiscordService.name);

  constructor(
    private readonly discord: Client,
    private readonly guildSettings: GuildSettingsService,
    private readonly caseService: MahoragaCaseService,
  ) {}

  async applySoftbanToAllGuilds(
    userId: string,
  ): Promise<MahoragaSoftbanResult[]> {
    this.caseService.parseDiscordId(userId);

    const guildIds = await this.guildSettings.getGuildsWithEnabledFeature(
      GuildSettings.MahoragaEnabled,
    );

    const results: MahoragaSoftbanResult[] = [];
    for (const guildId of guildIds) {
      results.push(await this.applySoftbanToGuild(userId, guildId));
    }
    return results;
  }

  async applySoftbanToGuild(
    userId: string,
    guildId: string,
  ): Promise<MahoragaSoftbanResult> {
    this.caseService.parseDiscordId(userId);
    this.caseService.parseDiscordId(guildId);

    const enabled = await this.guildSettings.getSetting<boolean>(
      guildId,
      GuildSettings.MahoragaEnabled,
      false,
    );
    if (!enabled) {
      return { guildId, status: 'skipped', detail: 'mahoraga disabled' };
    }

    const roleId = await this.guildSettings.getSetting<string>(
      guildId,
      GuildSettings.MahoragaSoftbanRoleId,
      null,
    );
    if (!roleId) {
      await this.logEvent(
        guildId,
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle('Softban Skipped')
          .setDescription('Softban role is not configured.')
          .addFields({ name: 'User', value: `<@${userId}>`, inline: true })
          .setTimestamp(),
      );
      return { guildId, status: 'skipped', detail: 'missing softban role' };
    }

    try {
      const guild = await this.discord.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return { guildId, status: 'skipped', detail: 'member not found' };
      }

      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        await this.logEvent(
          guildId,
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('Softban Skipped')
            .setDescription(`Role <@&${roleId}> was not found.`)
            .addFields({ name: 'User', value: `<@${userId}>`, inline: true })
            .setTimestamp(),
        );
        return { guildId, status: 'skipped', detail: 'role not found' };
      }

      if (member.roles.cache.has(role.id)) {
        return { guildId, status: 'already_applied' };
      }

      await member.roles.add(role, 'Mahoraga softban');
      await this.logEvent(
        guildId,
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('Softban Applied')
          .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Role', value: `<@&${roleId}>`, inline: true },
          )
          .setTimestamp(),
      );
      return { guildId, status: 'applied' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to apply softban in guild ${guildId}:`, error);
      await this.logEvent(
        guildId,
        new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('Softban Failed')
          .setDescription(detail)
          .addFields({ name: 'User', value: `<@${userId}>`, inline: true })
          .setTimestamp(),
      );
      return { guildId, status: 'failed', detail };
    }
  }

  async removeSoftbanFromAllGuilds(
    userId: string,
  ): Promise<MahoragaSoftbanResult[]> {
    const guildIds = await this.guildSettings.getGuildsWithEnabledFeature(
      GuildSettings.MahoragaEnabled,
    );

    const results: MahoragaSoftbanResult[] = [];
    for (const guildId of guildIds) {
      results.push(await this.removeSoftbanFromGuild(userId, guildId));
    }
    return results;
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
    await this.applySoftbanToGuild(member.id, member.guild.id);
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

  private async removeSoftbanFromGuild(
    userId: string,
    guildId: string,
  ): Promise<MahoragaSoftbanResult> {
    const roleId = await this.guildSettings.getSetting<string>(
      guildId,
      GuildSettings.MahoragaSoftbanRoleId,
      null,
    );
    if (!roleId) {
      return { guildId, status: 'skipped', detail: 'missing softban role' };
    }

    try {
      const guild = await this.discord.guilds.fetch(guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return { guildId, status: 'skipped', detail: 'member not found' };
      }

      if (!member.roles.cache.has(roleId)) {
        return { guildId, status: 'skipped', detail: 'role not applied' };
      }

      await member.roles.remove(roleId, 'Mahoraga unban');
      await this.logEvent(
        guildId,
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('Softban Removed')
          .addFields({ name: 'User', value: `<@${userId}>`, inline: true })
          .setTimestamp(),
      );
      return { guildId, status: 'applied', detail: 'removed' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to remove softban in guild ${guildId}:`, error);
      return { guildId, status: 'failed', detail };
    }
  }
}
