import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { truncateText } from '#lib/utils';

import { splitTranscript } from './message-transcript';
import {
  CHUNK_INSTRUCTIONS,
  LLM_TIMEOUT_MS,
  REDUCE_INSTRUCTIONS,
  SUMMARY_INSTRUCTIONS,
  SUMMARY_MAX_DECISION_CHARS,
  SUMMARY_MAX_DECISIONS,
  SUMMARY_MAX_SUMMARY_CHARS,
  SUMMARY_MAX_TOPIC_CHARS,
  SUMMARY_MAX_TOPICS,
  SUMMARY_MODEL,
} from './summarize.constants';
import type { SummaryResult } from './summarize.types';

export interface SummarizeContext {
  messageCount: number;
  channelName: string;
}

@Injectable()
export class SummarizeService {
  private readonly logger = new Logger(SummarizeService.name);

  constructor(private readonly openai: OpenAI) {}

  async summarize(
    transcript: string,
    context: SummarizeContext,
  ): Promise<SummaryResult> {
    const chunks = splitTranscript(transcript);

    if (chunks.length === 1) {
      return this.request(
        SUMMARY_INSTRUCTIONS,
        this.buildTranscriptInput(chunks[0], context, 1, 1),
        'single',
      );
    }

    const partials: SummaryResult[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const label = `chunk ${index + 1}/${chunks.length}`;
      partials.push(
        await this.request(
          CHUNK_INSTRUCTIONS,
          this.buildTranscriptInput(chunk, context, index + 1, chunks.length),
          label,
        ),
      );
    }

    const reduceInput = JSON.stringify({
      channel: `#${context.channelName}`,
      messages: context.messageCount,
      partials,
    });

    return this.request(REDUCE_INSTRUCTIONS, reduceInput, 'reduce');
  }

  private buildTranscriptInput(
    transcript: string,
    context: SummarizeContext,
    index: number,
    total: number,
  ): string {
    return [
      `Канал: #${context.channelName}`,
      `Всего сообщений: ${context.messageCount}`,
      `Фрагмент: ${index} из ${total}`,
      '',
      'Переписка:',
      transcript,
    ].join('\n');
  }

  private async request(
    instructions: string,
    input: string,
    label: string,
  ): Promise<SummaryResult> {
    const response = await this.openai.responses.create(
      {
        model: SUMMARY_MODEL,
        instructions,
        input,
        store: false,
      },
      {
        timeout: LLM_TIMEOUT_MS,
        maxRetries: 1,
      },
    );

    this.logger.log({
      msg: 'summarize tokens',
      label,
      input: response.usage?.input_tokens ?? 0,
      output: response.usage?.output_tokens ?? 0,
    });

    return parseSummaryResult(response.output_text ?? '');
  }
}

/** Parses and normalizes the model's JSON response. */
export function parseSummaryResult(text: string): SummaryResult {
  let data: unknown;

  try {
    data = JSON.parse(stripCodeFence(text));
  } catch (error) {
    throw new Error('LLM returned invalid JSON', { cause: error });
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('LLM response must be a JSON object');
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
    throw new Error('LLM response is missing summary');
  }

  const summary = formatSummary(obj.summary.trim());

  return {
    summary: truncateText(summary, SUMMARY_MAX_SUMMARY_CHARS),
    topics: normalizeStringArray(
      obj.topics,
      SUMMARY_MAX_TOPICS,
      SUMMARY_MAX_TOPIC_CHARS,
    ),
    decisions: normalizeStringArray(
      obj.decisions,
      SUMMARY_MAX_DECISIONS,
      SUMMARY_MAX_DECISION_CHARS,
    ),
  };
}

/** Keeps model paragraphs readable, splitting a long single paragraph. */
function formatSummary(value: string): string {
  const normalized = value.replace(/\\n/g, '\n');
  if (normalized.includes('\n') || normalized.length <= 280) {
    return normalized;
  }

  const sentences = normalized.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length < 3) return normalized;

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(' '));
  }

  return paragraphs.join('\n\n');
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);

  return match?.[1]?.trim() ?? trimmed;
}

function normalizeStringArray(
  value: unknown,
  maxItems: number,
  maxChars: number,
): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;

    const text = truncateText(item.trim(), maxChars);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(text);

    if (result.length >= maxItems) break;
  }

  return result;
}
