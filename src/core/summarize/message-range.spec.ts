import { describe, expect, it, mock } from 'bun:test';
import {
  type Channel,
  type ChatInputCommandInteraction,
  Collection,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
} from 'discord.js';

import {
  assertMessageHistoryAccess,
  assertRangeOrder,
  fetchMessageRange,
  parseMessageRef,
  resolveTargetChannel,
  resolveTargetChannelId,
  SummarizeUserError,
} from './message-range';

const GUILD_ID = '123456789012345678';
const CHANNEL_ID = '223456789012345678';

function id(index: number): string {
  return String(100000000000000000n + BigInt(index));
}

function makeMessage(
  idValue: string,
  content = 'text',
  overrides: Partial<Message> = {},
): Message {
  const timestamp = 1_700_000_000_000 + Number(BigInt(idValue) % 1_000_000n);

  return {
    id: idValue,
    content,
    createdTimestamp: timestamp,
    createdAt: new Date(timestamp),
    author: { username: 'user', bot: false },
    attachments: new Collection(),
    embeds: [],
    stickers: new Collection(),
    reference: null,
    ...overrides,
  } as unknown as Message;
}

function makeChannel(messages: Message[], guildId = GUILD_ID) {
  const sorted = [...messages].sort((a, b) =>
    BigInt(b.id) > BigInt(a.id) ? 1 : -1,
  );

  const fetch = mock(
    async (
      arg: string | { limit: number; before?: string; after?: string },
    ) => {
      if (typeof arg === 'string') {
        const found = messages.find((message) => message.id === arg);
        if (!found) throw new Error('Unknown Message');

        return found;
      }

      if (arg.after) {
        const candidates = sorted.filter(
          (message) => BigInt(message.id) > BigInt(arg.after!),
        );

        return new Collection(
          candidates
            .slice(-arg.limit)
            .map((message) => [message.id, message] as const),
        );
      }

      const candidates = arg.before
        ? sorted.filter((message) => BigInt(message.id) < BigInt(arg.before!))
        : sorted;

      return new Collection(
        candidates
          .slice(0, arg.limit)
          .map((message) => [message.id, message] as const),
      );
    },
  );

  const channel = {
    id: CHANNEL_ID,
    guildId,
    name: 'general',
    lastMessageId: sorted[0]?.id ?? null,
    messages: { fetch },
  } as unknown as GuildTextBasedChannel;

  return { channel, fetch };
}

function makeTextChannel(
  channelId: string,
  guildId: string,
): GuildTextBasedChannel {
  return {
    id: channelId,
    guildId,
    isTextBased: () => true,
    messages: { fetch: mock(async () => new Collection()) },
  } as unknown as GuildTextBasedChannel;
}

function makeInteraction(
  currentChannel: Channel | null,
  fetchedChannel: Channel | null,
): ChatInputCommandInteraction {
  return {
    guildId: GUILD_ID,
    channel: currentChannel,
    client: {
      channels: { fetch: mock(async () => fetchedChannel) },
    },
  } as unknown as ChatInputCommandInteraction;
}

function makeAccessChannel(allowed: boolean): GuildTextBasedChannel {
  return {
    permissionsFor: () => ({ has: () => allowed }),
  } as unknown as GuildTextBasedChannel;
}

function makeGuild(member: unknown, bot: unknown): Guild {
  return {
    members: {
      fetch: mock(async () => member),
      me: bot,
    },
  } as unknown as Guild;
}

describe('parseMessageRef', () => {
  it('parses full discord links', () => {
    const link = `https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${id(1)}`;

    expect(parseMessageRef(link)).toEqual({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      messageId: id(1),
    });
  });

  it('accepts links without a scheme and wrapped in angle brackets', () => {
    expect(
      parseMessageRef(
        `<discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${id(2)}>`,
      ),
    ).toEqual({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      messageId: id(2),
    });
  });

  it('parses plain message ids', () => {
    expect(parseMessageRef(id(3))).toEqual({ messageId: id(3) });
  });

  it('rejects unrelated values', () => {
    expect(parseMessageRef('hello')).toBeNull();
    expect(parseMessageRef('123')).toBeNull();
  });
});

describe('resolveTargetChannelId', () => {
  it('returns undefined when no link is present', () => {
    expect(resolveTargetChannelId([{ messageId: id(1) }])).toBeUndefined();
  });

  it('accepts links to the same channel', () => {
    expect(
      resolveTargetChannelId([
        { messageId: id(1), channelId: CHANNEL_ID },
        { messageId: id(2), channelId: CHANNEL_ID },
      ]),
    ).toBe(CHANNEL_ID);
  });

  it('rejects links to different channels', () => {
    expect(() =>
      resolveTargetChannelId([
        { messageId: id(1), channelId: CHANNEL_ID },
        { messageId: id(2), channelId: '323456789012345678' },
      ]),
    ).toThrow(SummarizeUserError);
  });
});

describe('assertRangeOrder', () => {
  it('accepts an older from and newer to', () => {
    expect(() => assertRangeOrder(id(1), id(2))).not.toThrow();
  });

  it('rejects from newer than to', () => {
    expect(() => assertRangeOrder(id(2), id(1))).toThrow(SummarizeUserError);
  });

  it('does nothing when a boundary is missing', () => {
    expect(() => assertRangeOrder(undefined, id(2))).not.toThrow();
    expect(() => assertRangeOrder(id(1), undefined)).not.toThrow();
  });
});

describe('resolveTargetChannel', () => {
  it('falls back to the current channel', async () => {
    const current = makeTextChannel(CHANNEL_ID, GUILD_ID);
    const interaction = makeInteraction(current, null);

    await expect(resolveTargetChannel(interaction, [])).resolves.toBe(current);
  });

  it('uses the channel from the link', async () => {
    const current = makeTextChannel('323456789012345678', GUILD_ID);
    const target = makeTextChannel(CHANNEL_ID, GUILD_ID);
    const interaction = makeInteraction(current, target);

    await expect(
      resolveTargetChannel(interaction, [
        { messageId: id(1), channelId: CHANNEL_ID, guildId: GUILD_ID },
      ]),
    ).resolves.toBe(target);
  });

  it('rejects a channel from another guild', async () => {
    const current = makeTextChannel('323456789012345678', GUILD_ID);
    const target = makeTextChannel(CHANNEL_ID, '999999999999999999');
    const interaction = makeInteraction(current, target);

    await expect(
      resolveTargetChannel(interaction, [
        {
          messageId: id(1),
          channelId: CHANNEL_ID,
          guildId: '999999999999999999',
        },
      ]),
    ).rejects.toThrow('Ссылка должна вести на текстовый канал этого сервера.');
  });

  it('rejects a non-text current channel', async () => {
    const interaction = makeInteraction(
      { isTextBased: () => false } as unknown as Channel,
      null,
    );

    await expect(resolveTargetChannel(interaction, [])).rejects.toThrow(
      'Команда доступна только в текстовом канале сервера.',
    );
  });
});

describe('assertMessageHistoryAccess', () => {
  it('passes when both the member and the bot can read history', async () => {
    const guild = makeGuild({ id: 'member' }, { id: 'bot' });

    await expect(
      assertMessageHistoryAccess(guild, makeAccessChannel(true), 'member'),
    ).resolves.toBeUndefined();
  });

  it('rejects when the member cannot read history', async () => {
    const guild = makeGuild({ id: 'member' }, { id: 'bot' });

    await expect(
      assertMessageHistoryAccess(guild, makeAccessChannel(false), 'member'),
    ).rejects.toThrow('У вас нет доступа к истории этого канала.');
  });

  it('rejects when the bot cannot read history', async () => {
    const channel = {
      permissionsFor: mock()
        .mockReturnValueOnce({ has: () => true })
        .mockReturnValueOnce({ has: () => false }),
    } as unknown as GuildTextBasedChannel;
    const guild = makeGuild({ id: 'member' }, { id: 'bot' });

    await expect(
      assertMessageHistoryAccess(guild, channel, 'member'),
    ).rejects.toThrow('У бота нет доступа к истории этого канала.');
  });
});

describe('fetchMessageRange', () => {
  it('returns the last N messages in chronological order', async () => {
    const messages = [1, 2, 3, 4, 5].map((index) => makeMessage(id(index)));
    const { channel } = makeChannel(messages);

    const range = await fetchMessageRange({ channel, count: 3 });

    expect(range.messages.map((message) => message.id)).toEqual([
      id(3),
      id(4),
      id(5),
    ]);
    expect(range.truncatedByCount).toBe(false);
  });

  it('includes both from and to', async () => {
    const messages = [1, 2, 3, 4, 5].map((index) => makeMessage(id(index)));
    const { channel } = makeChannel(messages);

    const range = await fetchMessageRange({
      channel,
      count: 10,
      fromId: id(2),
      toId: id(4),
    });

    expect(range.messages.map((message) => message.id)).toEqual([
      id(2),
      id(3),
      id(4),
    ]);
  });

  it('takes the first count messages when from is set', async () => {
    const messages = [1, 2, 3, 4, 5].map((index) => makeMessage(id(index)));
    const { channel } = makeChannel(messages);

    const range = await fetchMessageRange({
      channel,
      count: 2,
      fromId: id(1),
      toId: id(5),
    });

    expect(range.messages.map((message) => message.id)).toEqual([id(1), id(2)]);
    expect(range.truncatedByCount).toBe(true);
  });

  it('handles a single-message range without extra fetches', async () => {
    const messages = [makeMessage(id(3))];
    const { channel, fetch } = makeChannel(messages);

    const range = await fetchMessageRange({
      channel,
      count: 10,
      fromId: id(3),
      toId: id(3),
    });

    expect(range.messages.map((message) => message.id)).toEqual([id(3)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when the channel has no messages', async () => {
    const { channel } = makeChannel([]);

    await expect(fetchMessageRange({ channel, count: 3 })).rejects.toThrow(
      'В выбранном диапазоне нет сообщений.',
    );
  });

  it('throws when a boundary message is missing', async () => {
    const { channel } = makeChannel([makeMessage(id(1))]);

    await expect(
      fetchMessageRange({
        channel,
        count: 3,
        fromId: id(9),
      }),
    ).rejects.toThrow('Сообщение не найдено или удалено.');
  });

  it('skips messages created at or after the exclusion timestamp', async () => {
    const messages = [1, 2, 3, 4, 5].map((index) => makeMessage(id(index)));
    const { channel } = makeChannel(messages);
    const excludeAfterTimestamp = messages[4]!.createdTimestamp;

    const range = await fetchMessageRange({
      channel,
      count: 3,
      excludeAfterTimestamp,
    });

    expect(range.messages.map((message) => message.id)).toEqual([
      id(2),
      id(3),
      id(4),
    ]);
  });

  it('paginates through more than one Discord batch', async () => {
    const messages = Array.from({ length: 150 }, (_, index) =>
      makeMessage(id(index + 1)),
    );
    const { channel, fetch } = makeChannel(messages);

    const range = await fetchMessageRange({ channel, count: 150 });

    expect(range.messages).toHaveLength(150);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(range.messages[0]!.id).toBe(id(1));
    expect(range.messages[149]!.id).toBe(id(150));
  });

  it('paginates forward when from is set', async () => {
    const messages = Array.from({ length: 150 }, (_, index) =>
      makeMessage(id(index + 1)),
    );
    const { channel, fetch } = makeChannel(messages);

    const range = await fetchMessageRange({
      channel,
      count: 150,
      fromId: id(1),
    });

    expect(range.messages).toHaveLength(150);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(range.messages[0]!.id).toBe(id(1));
    expect(range.messages[149]!.id).toBe(id(150));
    expect(range.truncatedByCount).toBe(false);
  });
});
