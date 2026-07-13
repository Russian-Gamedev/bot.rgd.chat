import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { EmbedBuilder, GuildMember, Message } from 'discord.js';

import { MetricsService } from '#common/metrics/metrics.service';
import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import {
  MahoragaListQueryDto,
  ManualMahoragaCaseDto,
} from './dto/mahoraga.dto';
import { MahoragaCaseEntity } from './entities/mahoraga-case.entity';
import {
  createHoneypotEmbed,
  getMahoragaDetectorMode,
  MahoragaCaseStatus,
  MahoragaDetectionMode,
  MahoragaReason,
  MahoragaSoftbanResult,
} from './mahoraga.types';
import { MahoragaCaseService } from './mahoraga-case.service';
import { MahoragaDetectionService } from './mahoraga-detection.service';
import { MahoragaDiscordService } from './mahoraga-discord.service';

@Injectable()
export class MahoragaService {
  private readonly logger = new Logger(MahoragaService.name);

  constructor(
    private readonly detectionService: MahoragaDetectionService,
    private readonly caseService: MahoragaCaseService,
    private readonly discordService: MahoragaDiscordService,
    private readonly guildSettings: GuildSettingsService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async inspectMessage(message: Message): Promise<MahoragaCaseEntity | null> {
    const detection = await this.detectionService.inspectMessage(message);
    if (!detection) return null;

    const result = await this.caseService.registerCase({
      userId: detection.userId,
      status: detection.status,
      reason: detection.reason,
      evidence: detection.evidence,
    });

    if (detection.reason === MahoragaReason.Honeypot && result.case) {
      await this.updateHoneypotEmbed(message, detection.guildId);
    }

    const detectorMode = getMahoragaDetectorMode(
      detection.settings,
      detection.reason,
    );

    if (detectorMode === MahoragaDetectionMode.Monitor) {
      this.recordDetectionMetric(
        detection.guildId,
        detection.reason,
        detectorMode,
        result.case?.status ?? detection.status,
      );
      if (result.shouldNotifyMonitor) {
        await this.discordService.logEvent(
          detection.guildId,
          new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('Mahoraga Monitor')
            .setDescription('Softban would be applied')
            .addFields(
              { name: 'User', value: `<@${detection.userId}>`, inline: true },
              { name: 'Reason', value: detection.reason, inline: true },
              {
                name: 'Channel',
                value: `<#${detection.channelId}>`,
                inline: true,
              },
            )
            .setTimestamp(),
        );
      }
      return result.case;
    }

    const shouldApplySanction = this.shouldApplySanction(
      detection.reason,
      result,
    );

    if (
      this.shouldCleanupRepeatDetection(detection.reason, shouldApplySanction)
    ) {
      await this.deleteTrackedUserMessages(message, detection.guildId);
    }

    if (shouldApplySanction) {
      await this.applySoftbanWithCleanup(
        detection.userId,
        detection.guildId,
        detection.reason,
      );
    }

    this.recordDetectionMetric(
      detection.guildId,
      detection.reason,
      detectorMode,
      result.case?.status ?? detection.status,
    );

    return result.case;
  }

  private recordDetectionMetric(
    guildId: string,
    reason: MahoragaReason,
    mode: MahoragaDetectionMode,
    status: MahoragaCaseStatus,
  ) {
    this.metrics?.recordMahoragaDetection({
      guildId,
      reason,
      mode,
      status,
    });
  }

  private async updateHoneypotEmbed(
    message: Message,
    guildId: string,
  ): Promise<void> {
    try {
      const messageId = await this.guildSettings.getSetting<string>(
        guildId,
        GuildSettings.MahoragaHoneypotMessageId,
        null,
      );
      if (!messageId) return;

      const channel = message.channel;
      if (!channel.isTextBased() || !channel.isSendable()) return;

      const count = await this.caseService.countByReasonAndGuild(
        MahoragaReason.Honeypot,
        guildId,
      );
      const embed = createHoneypotEmbed(count);

      const embedMessage = await channel.messages
        .fetch(messageId)
        .catch(() => null);
      if (embedMessage) {
        await embedMessage.edit({ embeds: [embed] });
      } else {
        const newMessage = await channel.send({ embeds: [embed] });
        await this.guildSettings.setSetting(
          guildId,
          GuildSettings.MahoragaHoneypotMessageId,
          newMessage.id,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to update honeypot embed in guild ${guildId}: ${error}`,
      );
    }
  }

  private async deleteTrackedUserMessages(
    message: Message,
    guildId: string,
  ): Promise<void> {
    try {
      await message.delete().catch(() => {});
    } catch {
      // ignore
    }

    try {
      const entries = await this.detectionService.getTrackedMessages(
        guildId,
        message.author.id,
      );
      if (entries.length > 0) {
        await this.discordService.deleteUserMessages(guildId, entries);
        await this.detectionService.clearTrackedMessages(
          guildId,
          message.author.id,
        );
      }
    } catch {
      // ignore
    }
  }

  private shouldCleanupRepeatDetection(
    reason: MahoragaReason,
    shouldApplySanction: boolean,
  ): boolean {
    if (shouldApplySanction) return false;
    return (
      reason === MahoragaReason.Honeypot ||
      reason === MahoragaReason.TextRepeat ||
      reason === MahoragaReason.LinkRepeat ||
      reason === MahoragaReason.ImageRepeat
    );
  }

  private shouldApplySanction(
    reason: MahoragaReason,
    result: {
      case: MahoragaCaseEntity;
      shouldApplySoftban: boolean;
    },
  ): boolean {
    if (result.shouldApplySoftban) return true;
    if (result.case.status !== MahoragaCaseStatus.Active) return false;
    return (
      reason === MahoragaReason.Honeypot ||
      reason === MahoragaReason.TextRepeat ||
      reason === MahoragaReason.LinkRepeat ||
      reason === MahoragaReason.ImageRepeat
    );
  }

  private async applySoftbanWithCleanup(
    userId: string,
    guildId: string,
    reason: MahoragaReason,
  ): Promise<MahoragaSoftbanResult> {
    const trackedMessages = await this.detectionService.getTrackedMessages(
      guildId,
      userId,
    );
    const channelCount = new Set(
      trackedMessages.map((entry) => entry.channelId),
    ).size;
    const result = await this.discordService.applySoftbanToGuild(
      userId,
      guildId,
      `Mahoraga ${reason}`,
    );

    if (result.status === 'applied') {
      const cleanup = await this.discordService.verifyAndDeleteUserMessages(
        guildId,
        trackedMessages,
      );
      result.cleanup = cleanup.summary;
      await this.detectionService.removeTrackedMessages(
        guildId,
        userId,
        cleanup.resolvedEntries,
      );
    }

    await this.discordService.logEvent(
      guildId,
      this.createSoftbanResultEmbed(userId, reason, channelCount, result),
    );
    return result;
  }

  private createSoftbanResultEmbed(
    userId: string,
    reason: MahoragaReason,
    channelCount: number,
    result: MahoragaSoftbanResult,
  ): EmbedBuilder {
    const applied = result.status === 'applied';
    const embed = new EmbedBuilder()
      .setColor(applied ? 0xe67e22 : 0xe74c3c)
      .setTitle(applied ? 'Mahoraga Softban' : 'Mahoraga Softban Failed')
      .setDescription(
        applied
          ? this.getSoftbanDescription(userId, reason, channelCount)
          : `Could not temporarily ban <@${userId}>.`,
      )
      .addFields(
        { name: 'User', value: `<@${userId}>`, inline: true },
        { name: 'Reason', value: reason, inline: true },
        { name: 'Channels', value: String(channelCount), inline: true },
      )
      .setTimestamp();

    if (result.cleanup) {
      embed.addFields({
        name: 'Cleanup',
        value: [
          `Already deleted: ${result.cleanup.alreadyDeleted}`,
          `Manually deleted: ${result.cleanup.manuallyDeleted}`,
          `Failed: ${result.cleanup.failed}`,
        ].join('\n'),
      });
    }
    if (result.detail) {
      embed.addFields({ name: 'Detail', value: result.detail.slice(0, 1024) });
    }
    return embed;
  }

  private getSoftbanDescription(
    userId: string,
    reason: MahoragaReason,
    channelCount: number,
  ): string {
    if (reason === MahoragaReason.Manual) {
      return `<@${userId}> was temporarily banned by Mahoraga manual action.`;
    }
    return `<@${userId}> was temporarily banned for spam in ${channelCount} channels.`;
  }

  listCases(query: MahoragaListQueryDto): Promise<MahoragaCaseEntity[]> {
    return this.caseService.listCases(query);
  }

  getCaseByUserId(userId: string): Promise<MahoragaCaseEntity> {
    return this.caseService.getCaseByUserId(userId);
  }

  async createManualCase(
    dto: ManualMahoragaCaseDto,
    actorId?: string,
  ): Promise<MahoragaCaseEntity> {
    const userId = this.caseService.parseDiscordId(dto.user_id).toString();
    const guildId = dto.guild_id
      ? this.caseService.parseDiscordId(dto.guild_id).toString()
      : undefined;

    const result = await this.caseService.registerCase({
      userId,
      status: MahoragaCaseStatus.Active,
      reason: MahoragaReason.Manual,
      evidence: {
        reason: MahoragaReason.Manual,
        guildId,
        actorId,
        note: dto.reason,
        createdAt: new Date().toISOString(),
      },
    });

    if (result.shouldApplySoftban && guildId) {
      await this.applySoftbanWithCleanup(
        userId,
        guildId,
        MahoragaReason.Manual,
      );
    }
    this.metrics?.recordMahoragaDetection({
      guildId,
      reason: MahoragaReason.Manual,
      mode: MahoragaDetectionMode.On,
      status: result.case.status,
    });

    return result.case;
  }

  async pardonCase(
    userId: string,
    actorId?: string,
    reason?: string,
  ): Promise<{
    case: MahoragaCaseEntity;
  }> {
    const mahoragaCase = await this.caseService.pardonCase(
      userId,
      actorId,
      reason,
    );

    const guildId = mahoragaCase.source_guild_id?.toString();
    if (guildId) {
      await this.detectionService.clearTrackedMessages(guildId, userId);
    }

    this.metrics?.recordMahoragaDetection({
      guildId,
      reason: mahoragaCase.reason,
      mode: MahoragaDetectionMode.Off,
      status: MahoragaCaseStatus.Pardoned,
    });
    if (guildId) {
      await this.discordService.logEvent(
        guildId,
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle('Mahoraga Unban')
          .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            {
              name: 'Actor',
              value: actorId ? `<@${actorId}>` : 'API',
              inline: true,
            },
          )
          .setTimestamp(),
      );
    }

    return { case: mahoragaCase };
  }

  async syncSoftban(userId: string): Promise<MahoragaSoftbanResult> {
    const mahoragaCase = await this.caseService.getCaseByUserId(userId);
    if (
      mahoragaCase.status === MahoragaCaseStatus.Pardoned ||
      mahoragaCase.status === MahoragaCaseStatus.Observed
    ) {
      throw new BadRequestException(
        'Cannot sync softban for pardoned or observed case',
      );
    }

    const guildId = mahoragaCase.source_guild_id?.toString();
    if (!guildId) {
      throw new BadRequestException('Cannot sync softban without source guild');
    }

    const result = await this.applySoftbanWithCleanup(
      userId,
      guildId,
      mahoragaCase.reason,
    );
    this.metrics?.recordMahoragaDetection({
      guildId,
      reason: mahoragaCase.reason,
      mode: MahoragaDetectionMode.On,
      status: mahoragaCase.status,
    });
    return result;
  }

  handleMemberJoin(member: GuildMember): Promise<void> {
    return this.discordService.handleMemberJoin(member);
  }
}
