import { describe, expect, it } from 'bun:test';
import { Collection, type Message } from 'discord.js';
import { buildTranscript, splitTranscript } from './message-transcript';

function makeMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    content: '',
    createdAt: new Date('2026-10-23T12:00:00.000Z'),
    author: { username: 'Alice', bot: false },
    attachments: new Collection(),
    embeds: [],
    stickers: new Collection(),
    reference: null,
    ...overrides,
  } as unknown as Message;
}

describe('buildTranscript', () => {
  it('formats one line with timestamp, author and content', () => {
    expect(
      buildTranscript([makeMessage({ content: '  hello   world  ' })]),
    ).toBe('[2026-10-23T12:00:00.000Z] Alice: hello world');
  });

  it('marks bots', () => {
    const message = makeMessage({
      content: 'beep',
      author: { username: 'Helper', bot: true } as Message['author'],
    });

    expect(buildTranscript([message])).toContain('Helper (бот): beep');
  });

  it('includes reply, attachment, embed and sticker markers', () => {
    const message = makeMessage({
      content: 'look',
      reference: { messageId: '123' } as Message['reference'],
      attachments: new Collection([
        ['1', { name: 'pic.png', contentType: 'image/png' }],
      ]) as unknown as Message['attachments'],
      embeds: [
        { title: 'Post', url: 'https://example.com' },
      ] as unknown as Message['embeds'],
      stickers: new Collection([
        ['1', { name: 'Wave' }],
      ]) as unknown as Message['stickers'],
    });

    const line = buildTranscript([message]);

    expect(line).toContain('[ответ]');
    expect(line).toContain('look');
    expect(line).toContain('[вложение: pic.png (image/png)]');
    expect(line).toContain('[embed: Post https://example.com]');
    expect(line).toContain('[стикер: Wave]');
  });

  it('skips messages without content or markup', () => {
    expect(buildTranscript([makeMessage()])).toBe('');
  });

  it('joins messages with a newline', () => {
    const transcript = buildTranscript([
      makeMessage({ content: 'first' }),
      makeMessage({ content: 'second' }),
    ]);

    expect(transcript.split('\n')).toHaveLength(2);
  });

  it('keeps long message text intact', () => {
    const line = buildTranscript([makeMessage({ content: 'a'.repeat(2000) })]);
    const content = line.slice(line.indexOf(': ') + 2);

    expect(content).toHaveLength(2000);
    expect(content.endsWith('…')).toBe(false);
  });
});

describe('splitTranscript', () => {
  it('returns a single chunk when the transcript fits', () => {
    expect(splitTranscript('short', 10)).toEqual(['short']);
  });

  it('splits on line boundaries', () => {
    expect(splitTranscript('aaaa\nbbbb\ncccc', 9)).toEqual([
      'aaaa\nbbbb',
      'cccc',
    ]);
  });

  it('splits a single overlong line into pieces', () => {
    expect(splitTranscript('a'.repeat(25), 10)).toEqual([
      'aaaaaaaaaa',
      'aaaaaaaaaa',
      'aaaaa',
    ]);
  });
});
