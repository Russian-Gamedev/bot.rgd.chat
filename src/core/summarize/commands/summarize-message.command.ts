import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Message, MessageFlags, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';
import {
  Context,
  MessageCommand,
  type MessageCommandContext,
  TargetMessage,
} from 'necord';

import { SummarizeUserError } from '../message-range';
import { buildTranscript } from '../message-transcript';
import { SUMMARY_RATE_LIMIT_MESSAGE } from '../summarize.constants';
import { isSummarizeRateLimited } from '../summarize.rate-limit';
import { SummarizeService } from '../summarize.service';
import { buildSummaryEmbed } from '../summary.embed';

@Injectable()
export class SummarizeMessageCommand {
  private readonly logger = new Logger(SummarizeMessageCommand.name);

  constructor(
    private readonly summarizeService: SummarizeService,
    @Inject(Redis)
    private readonly redis: Redis,
  ) {}

  @MessageCommand({
    name: 'Пересказать сообщение',
  })
  async handle(
    @Context() [interaction]: MessageCommandContext,
    @TargetMessage() message: Message,
  ) {
    const guild = interaction.guild;
    if (!interaction.guildId || !guild) {
      return interaction.reply({
        content: 'Команда доступна только на сервере.',
        flags: MessageFlags.Ephemeral,
      });
    }

    let deferred = false;

    try {
      const target = message.partial
        ? await message.fetch().catch(() => message)
        : message;
      const transcript = buildTranscript([target]);

      if (!transcript) {
        throw new SummarizeUserError('В сообщении нет текста для пересказа.');
      }

      const isAdmin =
        interaction.memberPermissions?.has(
          PermissionsBitField.Flags.Administrator,
        ) ?? false;
      const isLimited = await isSummarizeRateLimited(
        this.redis,
        guild.id,
        interaction.user.id,
        isAdmin,
      );

      if (isLimited) {
        return interaction.reply({
          content: SUMMARY_RATE_LIMIT_MESSAGE,
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;

      const channelName =
        interaction.channel && 'name' in interaction.channel
          ? (interaction.channel.name ?? 'канал')
          : 'канал';

      const result = await this.summarizeService.summarize(transcript, {
        messageCount: 1,
        channelName,
      });

      const embed = buildSummaryEmbed(result, {
        guildId: guild.id,
        channelId: target.channelId,
        channelName,
        messageCount: 1,
        firstMessageId: target.id,
        lastMessageId: target.id,
        truncatedByCount: false,
      });

      return interaction.editReply({
        embeds: [embed],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      if (error instanceof SummarizeUserError) {
        this.logger.warn(error.message);
      } else {
        this.logger.error(
          error instanceof Error ? (error.stack ?? error.message) : error,
        );
      }

      const content =
        error instanceof SummarizeUserError
          ? error.message
          : 'Не удалось получить пересказ. Попробуйте позже.';

      if (deferred) {
        await interaction.editReply({ content }).catch(() => undefined);
        return;
      }

      await interaction
        .reply({ content, flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
  }
}
