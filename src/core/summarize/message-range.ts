import {
  type Channel,
  type ChatInputCommandInteraction,
  type Collection,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  PermissionsBitField,
  type Snowflake,
} from 'discord.js';
import { isDiscordId, parseDiscordMessageUrl } from '#lib/utils';

import {
  MAX_MESSAGE_COUNT,
  MESSAGE_FETCH_BATCH_SIZE,
} from './summarize.constants';
import type { FetchedMessageRange, ParsedMessageRef } from './summarize.types';

const DISCORD_URL_WITHOUT_SCHEME =
  /^(?:[a-z]+\.)?discord(?:app)?\.com\/channels\//i;

export class SummarizeUserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SummarizeUserError';
  }
}

export interface FetchMessageRangeOptions {
  channel: GuildTextBasedChannel;
  count: number;
  fromId?: string;
  toId?: string;
  excludeAfterTimestamp?: number;
}

/** Parses a message ID or a discord.com/channels link into its parts. */
export function parseMessageRef(value: string): ParsedMessageRef | null {
  const normalized = normalizeReferenceInput(value);
  const candidate = DISCORD_URL_WITHOUT_SCHEME.test(normalized)
    ? `https://${normalized}`
    : normalized;

  const link = parseDiscordMessageUrl(candidate);
  if (link) return link;

  return isDiscordId(normalized) ? { messageId: normalized } : null;
}

/** Returns the single channel referenced by from/to, if any. */
export function resolveTargetChannelId(
  refs: readonly ParsedMessageRef[],
): string | undefined {
  const channelIds = [
    ...new Set(
      refs
        .map((ref) => ref.channelId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (channelIds.length > 1) {
    throw new SummarizeUserError(
      'Параметры from и to должны указывать на один канал.',
    );
  }

  return channelIds[0];
}

/** Checks that from is not newer than to. */
export function assertRangeOrder(fromId?: string, toId?: string): void {
  if (fromId && toId && BigInt(fromId) > BigInt(toId)) {
    throw new SummarizeUserError(
      'Параметр from должен указывать на сообщение не новее, чем to.',
    );
  }
}

/** Narrows a channel to a guild text channel of the expected guild. */
export function isGuildTextBasedChannel(
  channel: Channel | null,
  guildId: string,
): channel is GuildTextBasedChannel {
  return Boolean(
    channel?.isTextBased() &&
      'guildId' in channel &&
      channel.guildId === guildId,
  );
}

/** Resolves the channel from the links, falling back to the current one. */
export async function resolveTargetChannel(
  interaction: ChatInputCommandInteraction,
  refs: readonly ParsedMessageRef[],
): Promise<GuildTextBasedChannel> {
  const guildId = interaction.guildId;
  if (!guildId) {
    throw new SummarizeUserError('Команда доступна только на сервере.');
  }

  const channelId = resolveTargetChannelId(refs);
  if (!channelId) {
    if (!isGuildTextBasedChannel(interaction.channel, guildId)) {
      throw new SummarizeUserError(
        'Команда доступна только в текстовом канале сервера.',
      );
    }

    return interaction.channel;
  }

  const channel = await interaction.client.channels
    .fetch(channelId)
    .catch(() => null);

  if (!isGuildTextBasedChannel(channel, guildId)) {
    throw new SummarizeUserError(
      'Ссылка должна вести на текстовый канал этого сервера.',
    );
  }

  return channel;
}

/** Verifies that both the member and the bot can read the channel history. */
export async function assertMessageHistoryAccess(
  guild: Guild,
  channel: GuildTextBasedChannel,
  userId: string,
): Promise<void> {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) {
    throw new SummarizeUserError('Не удалось проверить права пользователя.');
  }

  const required = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory,
  ];

  if (!channel.permissionsFor(member)?.has(required)) {
    throw new SummarizeUserError('У вас нет доступа к истории этого канала.');
  }

  const bot = guild.members.me;
  if (!bot) {
    throw new SummarizeUserError('Бот не готов. Попробуйте позже.');
  }

  if (!channel.permissionsFor(bot)?.has(required)) {
    throw new SummarizeUserError('У бота нет доступа к истории этого канала.');
  }
}

/**
 * Fetches at most `count` messages ending at `to` (or at the latest message),
 * without going older than `from`. The result is chronological.
 */
export async function fetchMessageRange(
  options: FetchMessageRangeOptions,
): Promise<FetchedMessageRange> {
  const { channel, count, fromId, toId, excludeAfterTimestamp } = options;

  if (!Number.isInteger(count) || count < 1 || count > MAX_MESSAGE_COUNT) {
    throw new SummarizeUserError(
      `Количество сообщений должно быть от 1 до ${MAX_MESSAGE_COUNT}.`,
    );
  }

  const fromMessage = fromId
    ? await fetchBoundaryMessage(channel, fromId)
    : undefined;
  const toMessage = toId
    ? toId === fromId
      ? fromMessage
      : await fetchBoundaryMessage(channel, toId)
    : undefined;

  assertRangeOrder(fromMessage?.id, toMessage?.id);

  const limit = Math.min(count, MAX_MESSAGE_COUNT);
  const messages: Message[] = [];
  const seen = new Set<string>();

  const add = (message: Message) => {
    if (seen.has(message.id)) return;
    if (
      excludeAfterTimestamp !== undefined &&
      message.createdTimestamp >= excludeAfterTimestamp
    ) {
      return;
    }

    seen.add(message.id);
    messages.push(message);
  };

  if (toMessage) add(toMessage);

  const singleMessage = Boolean(fromId && toId && fromId === toId);
  let before = toMessage?.id;
  let reachedFrom = false;

  while (!singleMessage && messages.length < limit) {
    const requested = Math.min(
      MESSAGE_FETCH_BATCH_SIZE,
      limit - messages.length,
    );

    let batch: Collection<Snowflake, Message>;
    try {
      batch = await channel.messages.fetch({ limit: requested, before });
    } catch (error) {
      throw new SummarizeUserError('Не удалось загрузить историю сообщений.', {
        cause: error,
      });
    }

    if (batch.size === 0) break;

    const batchMessages = [...batch.values()];
    for (const message of batchMessages) {
      if (fromId && BigInt(message.id) < BigInt(fromId)) {
        reachedFrom = true;
        break;
      }

      add(message);
      if (messages.length >= limit) break;
    }

    if (reachedFrom || messages.length >= limit) break;
    if (batch.size < requested) break;

    const oldestId = batchMessages[batchMessages.length - 1]?.id;
    if (!oldestId || oldestId === before) break;
    before = oldestId;
  }

  if (messages.length === 0) {
    throw new SummarizeUserError('В выбранном диапазоне нет сообщений.');
  }

  const oldest = messages[messages.length - 1];
  const truncatedByCount = Boolean(
    fromId &&
      oldest &&
      messages.length >= limit &&
      BigInt(oldest.id) > BigInt(fromId),
  );

  messages.reverse();

  return {
    messages,
    channelId: channel.id,
    guildId: channel.guildId,
    truncatedByCount,
  };
}

function normalizeReferenceInput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

async function fetchBoundaryMessage(
  channel: GuildTextBasedChannel,
  messageId: string,
): Promise<Message> {
  try {
    return await channel.messages.fetch(messageId);
  } catch (error) {
    throw new SummarizeUserError('Сообщение не найдено или удалено.', {
      cause: error,
    });
  }
}
