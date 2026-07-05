import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EmbedBuilder, GuildMember, Message } from 'discord.js';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import {
  MahoragaListQueryDto,
  ManualMahoragaCaseDto,
} from './dto/mahoraga.dto';
import { MahoragaCaseEntity } from './entities/mahoraga-case.entity';
import {
  MahoragaCaseStatus,
  MahoragaDetectionMode,
  MahoragaDetectionSettings,
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
      await this.handleHoneypotDetection(message, detection.guildId);
    }

    const detectorMode = this.getDetectorMode(
      detection.settings,
      detection.reason,
    );

    if (detectorMode === MahoragaDetectionMode.Monitor) {
      await this.discordService.logEvent(
        detection.guildId,
        `Mahoraga would softban <@${detection.userId}> for ${detection.reason} in <#${detection.channelId}>.`,
      );
      return result.case;
    }

    await this.discordService.logEvent(
      detection.guildId,
      `Mahoraga detected ${detection.reason} from <@${detection.userId}> in <#${detection.channelId}>.`,
    );

    if (result.shouldApplySoftban) {
      await this.discordService.applySoftbanToAllGuilds(detection.userId);
    }

    const cutoff =
      Date.now() - detection.settings.youngAccountMonths * 30 * 86_400_000;
    if (
      message.author.createdTimestamp >= cutoff &&
      detection.settings.youngAccountMode === MahoragaDetectionMode.On
    ) {
      await this.discordService.logEvent(
        detection.guildId,
        `Mahoraga attention: account <@${detection.userId}> is less than ${detection.settings.youngAccountMonths} months old.`,
      );
    }

    return result.case;
  }

  private async handleHoneypotDetection(
    message: Message,
    guildId: string,
  ): Promise<void> {
    try {
      await message.delete().catch(() => {});
    } catch {
      // ignore
    }

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
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('НЕ ПИШИТЕ СЮДА СООБЩЕНИЯ')
        .setDescription(
          'Этот канал для рыбалки спам ботов. За любое сообщение вы получите softban. (если вы глупенький и нажали разбана не будет)',
        )
        .setFooter({ text: `Поймано спаммеров: ${count}` });

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

  private getDetectorMode(
    settings: MahoragaDetectionSettings,
    reason: MahoragaReason,
  ): MahoragaDetectionMode {
    switch (reason) {
      case MahoragaReason.Honeypot:
        return settings.honeypotMode;
      case MahoragaReason.TextRepeat:
      case MahoragaReason.LinkRepeat:
      case MahoragaReason.ImageRepeat:
        return settings.repeatMode;
      default:
        return MahoragaDetectionMode.On;
    }
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

    if (result.shouldApplySoftban) {
      await this.discordService.applySoftbanToAllGuilds(userId);
    }

    if (guildId) {
      await this.discordService.logEvent(
        guildId,
        `Mahoraga manual softban: <@${userId}> by ${actorId ? `<@${actorId}>` : 'API'}.`,
      );
    }

    return result.case;
  }

  async pardonCase(
    userId: string,
    actorId?: string,
    reason?: string,
  ): Promise<{
    case: MahoragaCaseEntity;
    results: MahoragaSoftbanResult[];
  }> {
    const mahoragaCase = await this.caseService.pardonCase(
      userId,
      actorId,
      reason,
    );
    const results =
      await this.discordService.removeSoftbanFromAllGuilds(userId);

    const guildId = mahoragaCase.source_guild_id?.toString();
    if (guildId) {
      await this.discordService.logEvent(
        guildId,
        `Mahoraga unban: <@${userId}> by ${actorId ? `<@${actorId}>` : 'API'}.`,
      );
    }

    return { case: mahoragaCase, results };
  }

  async syncSoftban(userId: string): Promise<MahoragaSoftbanResult[]> {
    const mahoragaCase = await this.caseService.getCaseByUserId(userId);
    if (
      mahoragaCase.status === MahoragaCaseStatus.Pardoned ||
      mahoragaCase.status === MahoragaCaseStatus.Observed
    ) {
      throw new BadRequestException(
        'Cannot sync softban for pardoned or observed case',
      );
    }

    return this.discordService.applySoftbanToAllGuilds(userId);
  }

  handleMemberJoin(member: GuildMember): Promise<void> {
    return this.discordService.handleMemberJoin(member);
  }
}
