import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
} from 'discord.js';

import { MahoragaCaseEntity } from './entities/mahoraga-case.entity';
import { MahoragaCaseStatus } from './mahoraga.types';
import { MahoragaCaseService } from './mahoraga-case.service';
import { MahoragaDiscordService } from './mahoraga-discord.service';

export type MahoragaVerificationResult =
  | 'verified'
  | 'not_found'
  | 'wrong_user'
  | 'expired'
  | 'processed';

@Injectable()
export class MahoragaVerificationService {
  private readonly logger = new Logger(MahoragaVerificationService.name);

  constructor(
    private readonly discord: Client,
    private readonly caseService: MahoragaCaseService,
    private readonly discordService: MahoragaDiscordService,
  ) {}

  async sendVerification(mahoragaCase: MahoragaCaseEntity): Promise<void> {
    const token = mahoragaCase.verification_token;
    if (!token) return;

    const userId = mahoragaCase.user_id.toString();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`mahoraga_verify/${token}`)
        .setLabel('Пройти проверку')
        .setStyle(ButtonStyle.Success),
    );

    try {
      const user = await this.discord.users.fetch(userId);
      await user.send({
        content:
          'Mahoraga заметил подозрительную активность на RGD-сервере. Нажмите кнопку ниже, чтобы пройти быструю проверку и снять softban.',
        components: [row],
      });

      const guildId = mahoragaCase.source_guild_id?.toString();
      if (guildId) {
        await this.discordService.logEvent(
          guildId,
          `Mahoraga verification sent to <@${userId}>.`,
        );
      }
    } catch (error) {
      const guildId = mahoragaCase.source_guild_id?.toString();
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not DM verification to ${userId}: ${detail}`);
      await this.caseService.activatePendingCase(mahoragaCase);
      if (guildId) {
        await this.discordService.logEvent(
          guildId,
          `Mahoraga verification failed for <@${userId}>; case activated. ${detail}`,
        );
      }
    }
  }

  async verifyByToken(
    token: string,
    interactionUserId: string,
  ): Promise<MahoragaVerificationResult> {
    const mahoragaCase =
      await this.caseService.getCaseByVerificationToken(token);
    if (!mahoragaCase) return 'not_found';
    if (mahoragaCase.user_id.toString() !== interactionUserId) {
      return 'wrong_user';
    }
    if (mahoragaCase.status !== MahoragaCaseStatus.PendingVerification) {
      return 'processed';
    }

    const expiresAt = mahoragaCase.verification_expires_at;
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      await this.activateExpiredCase(mahoragaCase);
      return 'expired';
    }

    const pardoned = await this.caseService.pardonCase(
      interactionUserId,
      interactionUserId,
      'verification',
    );
    await this.discordService.removeSoftbanFromAllGuilds(interactionUserId);

    const guildId = pardoned.source_guild_id?.toString();
    if (guildId) {
      await this.discordService.logEvent(
        guildId,
        `Mahoraga verification passed for <@${interactionUserId}>.`,
      );
    }
    return 'verified';
  }

  @Cron('*/5 * * * *', { name: 'mahoraga-expire-verifications' })
  async expireVerificationCases(): Promise<void> {
    const expired = await this.caseService.getExpiredVerificationCases();
    for (const mahoragaCase of expired) {
      await this.activateExpiredCase(mahoragaCase);
    }
  }

  private async activateExpiredCase(
    mahoragaCase: MahoragaCaseEntity,
  ): Promise<void> {
    await this.caseService.activatePendingCase(mahoragaCase);

    const guildId = mahoragaCase.source_guild_id?.toString();
    if (guildId) {
      await this.discordService.logEvent(
        guildId,
        `Mahoraga verification expired for <@${mahoragaCase.user_id}>; case activated.`,
      );
    }
  }
}
