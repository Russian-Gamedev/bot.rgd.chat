import type { Message } from 'discord.js';

export interface ParsedMessageRef {
  messageId: string;
  channelId?: string;
  guildId?: string;
}

export interface FetchedMessageRange {
  messages: Message[];
  channelId: string;
  guildId: string;
  truncatedByCount: boolean;
}

export interface SummaryResult {
  summary: string;
  topics: string[];
  decisions: string[];
}
