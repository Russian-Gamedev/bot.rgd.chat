import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessageFlags, PermissionsBitField } from 'discord.js';
import Redis from 'ioredis';
import {
  Context,
  IntegerOption,
  Options,
  SlashCommand,
  type SlashCommandContext,
  StringOption,
} from 'necord';

import {
  assertMessageHistoryAccess,
  assertRangeOrder,
  fetchMessageRange,
  parseMessageRef,
  resolveTargetChannel,
  SummarizeUserError,
} from '../message-range';
import { buildTranscript } from '../message-transcript';
import {
  DEFAULT_MESSAGE_COUNT,
  MAX_MESSAGE_COUNT,
  SUMMARY_RATE_LIMIT_MESSAGE,
} from '../summarize.constants';
import { isSummarizeRateLimited } from '../summarize.rate-limit';
import { SummarizeService } from '../summarize.service';
import type { ParsedMessageRef } from '../summarize.types';
import { buildSummaryEmbed } from '../summary.embed';

class SummarizeDto {
  @IntegerOption({
    name: 'count',
    description: 'Сколько сообщений взять (1–500)',
    required: false,
    min_value: 1,
    max_value: MAX_MESSAGE_COUNT,
  })
  count?: number;

  @StringOption({
    name: 'from',
    description: 'ID или ссылка на первое сообщение; ссылка задаёт канал',
    required: false,
  })
  from?: string;

  @StringOption({
    name: 'to',
    description: 'ID или ссылка на последнее сообщение; ссылка задаёт канал',
    required: false,
  })
  to?: string;
}

@Injectable()
export class SummarizeCommand {
  private readonly logger = new Logger(SummarizeCommand.name);

  constructor(
    private readonly summarizeService: SummarizeService,
    @Inject(Redis)
    private readonly redis: Redis,
  ) {}

  @SlashCommand({
    name: 'summarize',
    description: 'Пересказать сообщения',
  })
  async handle(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SummarizeDto,
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
      const fromRef = dto.from ? parseMessageRef(dto.from) : null;
      const toRef = dto.to ? parseMessageRef(dto.to) : null;

      if ((dto.from && !fromRef) || (dto.to && !toRef)) {
        throw new SummarizeUserError(
          'Укажите корректный ID или ссылку на сообщение.',
        );
      }

      const refs = [fromRef, toRef].filter((ref): ref is ParsedMessageRef =>
        Boolean(ref),
      );
      const targetChannel = await resolveTargetChannel(interaction, refs);
      await assertMessageHistoryAccess(
        guild,
        targetChannel,
        interaction.user.id,
      );

      const fromId = fromRef?.messageId;
      const toId = toRef?.messageId;
      assertRangeOrder(fromId, toId);

      // An explicit from defines the start of the range, so read up to the
      // hard cap instead of the "last N" default.
      const count =
        dto.count ?? (fromId ? MAX_MESSAGE_COUNT : DEFAULT_MESSAGE_COUNT);
      if (!Number.isInteger(count) || count < 1 || count > MAX_MESSAGE_COUNT) {
        throw new SummarizeUserError(
          `Количество сообщений должно быть от 1 до ${MAX_MESSAGE_COUNT}.`,
        );
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

      const isCrossChannel = targetChannel.id !== interaction.channelId;

      await interaction.deferReply(
        isCrossChannel ? { flags: MessageFlags.Ephemeral } : {},
      );
      deferred = true;

      const range = await fetchMessageRange({
        channel: targetChannel,
        count,
        fromId,
        toId,
        excludeAfterTimestamp: isCrossChannel
          ? undefined
          : interaction.createdTimestamp,
      });

      const transcript = buildTranscript(range.messages);
      if (!transcript) {
        throw new SummarizeUserError(
          'В выбранном диапазоне нет текста для пересказа.',
        );
      }

      const result = await this.summarizeService.summarize(transcript, {
        messageCount: range.messages.length,
        channelName: targetChannel.name,
      });

      const first = range.messages[0];
      const last = range.messages[range.messages.length - 1];
      if (!first || !last) {
        throw new SummarizeUserError('В выбранном диапазоне нет сообщений.');
      }

      const embed = buildSummaryEmbed(result, {
        guildId: interaction.guildId,
        channelId: targetChannel.id,
        channelName: targetChannel.name,
        messageCount: range.messages.length,
        firstMessageId: first.id,
        lastMessageId: last.id,
        truncatedByCount: range.truncatedByCount,
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
