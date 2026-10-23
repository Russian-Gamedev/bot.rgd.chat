import type { Message } from 'discord.js';

import { MAX_TRANSCRIPT_CHARS_PER_CALL } from './summarize.constants';

/** Builds one line per message for the LLM prompt. */
export function buildTranscript(messages: readonly Message[]): string {
  return messages
    .map(buildMessageLine)
    .filter((line): line is string => Boolean(line))
    .join('\n');
}

/** Splits a transcript into chunks no longer than maxChars. */
export function splitTranscript(
  transcript: string,
  maxChars = MAX_TRANSCRIPT_CHARS_PER_CALL,
): string[] {
  if (transcript.length <= maxChars) return [transcript];

  const chunks: string[] = [];
  let current = '';

  for (const line of transcript.split('\n')) {
    if (line.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let index = 0; index < line.length; index += maxChars) {
        chunks.push(line.slice(index, index + maxChars));
      }
      continue;
    }

    if (current.length + line.length + 1 > maxChars) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);

  return chunks;
}

function buildMessageLine(message: Message): string | null {
  const parts: string[] = [];

  if (message.reference?.messageId) {
    parts.push('[ответ]');
  }

  const content = message.content.replace(/\s+/g, ' ').trim();
  if (content) parts.push(content);

  for (const attachment of message.attachments.values()) {
    const type = attachment.contentType ? ` (${attachment.contentType})` : '';
    parts.push(`[вложение: ${attachment.name}${type}]`);
  }

  for (const embed of message.embeds) {
    const title = embed.title?.trim();
    const url = embed.url?.trim();
    const label = title ? `: ${title}` : '';
    const link = url ? ` ${url}` : '';
    parts.push(`[embed${label}${link}]`);
  }

  for (const sticker of message.stickers.values()) {
    parts.push(`[стикер: ${sticker.name}]`);
  }

  if (parts.length === 0) return null;

  const author = message.author?.username ?? 'неизвестный';
  const bot = message.author?.bot ? ' (бот)' : '';
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();

  return `[${message.createdAt.toISOString()}] ${author}${bot}: ${text}`;
}
