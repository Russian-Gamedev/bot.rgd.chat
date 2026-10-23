import { describe, expect, it, mock } from 'bun:test';
import type OpenAI from 'openai';

import {
  LLM_TIMEOUT_MS,
  MAX_TRANSCRIPT_CHARS_PER_CALL,
  REDUCE_INSTRUCTIONS,
  SUMMARY_MAX_DECISION_CHARS,
  SUMMARY_MAX_SUMMARY_CHARS,
  SUMMARY_MODEL,
} from './summarize.constants';
import { parseSummaryResult, SummarizeService } from './summarize.service';

function makeService(outputs: string[]) {
  const create = mock(async (_params: unknown, _options?: unknown) => {
    const output = outputs.shift();
    if (output === undefined) throw new Error('unexpected LLM call');

    return {
      output_text: output,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  });

  const openai = { responses: { create } } as unknown as OpenAI;

  return { service: new SummarizeService(openai), create };
}

const context = { messageCount: 3, channelName: 'general' };

describe('SummarizeService', () => {
  it('makes one request for a short transcript', async () => {
    const { service, create } = makeService([
      JSON.stringify({ summary: 'ok', topics: ['a'], decisions: ['b'] }),
    ]);

    const result = await service.summarize('short transcript', context);

    expect(result).toEqual({
      summary: 'ok',
      topics: ['a'],
      decisions: ['b'],
    });
    expect(create).toHaveBeenCalledTimes(1);

    const params = create.mock.calls[0]?.[0] as {
      model: string;
      input: string;
      store: boolean;
    };
    const options = create.mock.calls[0]?.[1] as { timeout: number };

    expect(params.model).toBe(SUMMARY_MODEL);
    expect(params.input).toContain('short transcript');
    expect(params.store).toBe(false);
    expect(options.timeout).toBe(LLM_TIMEOUT_MS);
  });

  it('summarizes chunks and then reduces them', async () => {
    const { service, create } = makeService([
      JSON.stringify({ summary: 'part 1', topics: [], decisions: [] }),
      JSON.stringify({ summary: 'part 2', topics: [], decisions: [] }),
      JSON.stringify({ summary: 'final', topics: [], decisions: [] }),
    ]);

    const result = await service.summarize(
      'x'.repeat(MAX_TRANSCRIPT_CHARS_PER_CALL + 1),
      context,
    );

    expect(result.summary).toBe('final');
    expect(create).toHaveBeenCalledTimes(3);

    const reduceParams = create.mock.calls[2]?.[0] as {
      instructions: string;
      input: string;
    };

    expect(reduceParams.instructions).toBe(REDUCE_INSTRUCTIONS);
    expect(reduceParams.input).toContain('"summary":"part 1"');
    expect(reduceParams.input).toContain('"summary":"part 2"');
  });

  it('rejects an invalid JSON response', async () => {
    const { service } = makeService(['not json']);

    await expect(
      service.summarize('short transcript', context),
    ).rejects.toThrow('LLM returned invalid JSON');
  });
});

describe('parseSummaryResult', () => {
  it('strips a json code fence', () => {
    expect(parseSummaryResult('```json\n{"summary":"ok"}\n```')).toEqual({
      summary: 'ok',
      topics: [],
      decisions: [],
    });
  });

  it('normalizes duplicate and oversized values', () => {
    const result = parseSummaryResult(
      JSON.stringify({
        summary: 's'.repeat(SUMMARY_MAX_SUMMARY_CHARS + 100),
        topics: ['a', 'A', 'b', 'c', 'd', 'e', 'f', 'g'],
        decisions: ['x'.repeat(SUMMARY_MAX_DECISION_CHARS + 100)],
      }),
    );

    expect(result.summary).toHaveLength(SUMMARY_MAX_SUMMARY_CHARS);
    expect(result.topics).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result.decisions[0]).toHaveLength(SUMMARY_MAX_DECISION_CHARS);
  });

  it('rejects a response without a summary', () => {
    expect(() => parseSummaryResult('{"topics":[]}')).toThrow(
      'LLM response is missing summary',
    );
  });

  it('rejects a non-object response', () => {
    expect(() => parseSummaryResult('[]')).toThrow(
      'LLM response must be a JSON object',
    );
  });
});
