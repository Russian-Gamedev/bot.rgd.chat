import { EmbedBuilder } from 'discord.js';
import { messageLinkRaw, truncateText } from '#lib/utils';

import type { SummaryResult } from './summarize.types';

export interface SummaryEmbedContext {
  guildId: string;
  channelId: string;
  channelName: string;
  messageCount: number;
  firstMessageId: string;
  lastMessageId: string;
  truncatedByCount: boolean;
}

const MAX_DESCRIPTION_CHARS = 4096;
const MAX_FIELD_CHARS = 1024;
const MAX_FOOTER_CHARS = 2048;

/** Builds the public summary embed, keeping every part within Discord limits. */
export function buildSummaryEmbed(
  result: SummaryResult,
  context: SummaryEmbedContext,
): EmbedBuilder {
  const footer = [
    `${context.messageCount} сообщений`,
    `#${context.channelName}`,
  ];
  if (context.truncatedByCount) footer.push('диапазон ограничен count');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📝 Пересказ сообщений')
    .setDescription(truncateText(result.summary, MAX_DESCRIPTION_CHARS) || '—')
    .setFooter({
      text: truncateText(footer.join(' · '), MAX_FOOTER_CHARS),
    });

  const topics = formatList(result.topics);
  if (topics) {
    embed.addFields({
      name: '🧵 Темы',
      value: truncateText(topics, MAX_FIELD_CHARS),
      inline: false,
    });
  }

  const decisions = formatList(result.decisions);
  if (decisions) {
    embed.addFields({
      name: '✅ Решения и итоги',
      value: truncateText(decisions, MAX_FIELD_CHARS),
      inline: false,
    });
  }

  const firstLink = messageLinkRaw(
    context.guildId,
    context.channelId,
    context.firstMessageId,
  );
  const lastLink = messageLinkRaw(
    context.guildId,
    context.channelId,
    context.lastMessageId,
  );
  const range =
    context.firstMessageId === context.lastMessageId
      ? `[сообщение](${firstLink})`
      : `[первое сообщение](${firstLink}) · [последнее сообщение](${lastLink})`;

  embed.addFields({
    name: '🔗 Диапазон',
    value: range,
    inline: false,
  });

  return embed;
}

function formatList(items: readonly string[]): string {
  return items.map((item) => `• ${item}`).join('\n');
}
