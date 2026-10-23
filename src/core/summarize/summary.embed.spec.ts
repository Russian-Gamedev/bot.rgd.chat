import { describe, expect, it } from 'bun:test';

import { buildSummaryEmbed, type SummaryEmbedContext } from './summary.embed';

const context: SummaryEmbedContext = {
  guildId: '123456789012345678',
  channelId: '223456789012345678',
  channelName: 'general',
  messageCount: 12,
  firstMessageId: '323456789012345678',
  lastMessageId: '423456789012345678',
  truncatedByCount: false,
};

const result = {
  summary: 'Краткий пересказ',
  topics: ['тема'],
  decisions: ['итог'],
};

describe('buildSummaryEmbed', () => {
  it('renders the summary, topics, decisions and range', () => {
    const json = buildSummaryEmbed(result, context).toJSON();
    const fields = json.fields ?? [];

    expect(json.title).toBe('📝 Пересказ сообщений');
    expect(json.description).toBe('Краткий пересказ');
    expect(fields).toContainEqual(
      expect.objectContaining({ name: '🧵 Темы', value: '• тема' }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: '✅ Решения и итоги',
        value: '• итог',
      }),
    );
    expect(fields).toContainEqual(
      expect.objectContaining({
        name: '🔗 Диапазон',
        value: expect.stringContaining(
          'https://discord.com/channels/123456789012345678/223456789012345678/323456789012345678',
        ),
      }),
    );
  });

  it('omits empty optional fields', () => {
    const json = buildSummaryEmbed(
      { summary: 'Кратко', topics: [], decisions: [] },
      context,
    ).toJSON();
    const names = (json.fields ?? []).map((field) => field.name);

    expect(names).not.toContain('🧵 Темы');
    expect(names).not.toContain('✅ Решения и итоги');
    expect(names).toContain('🔗 Диапазон');
  });

  it('shows a single link for a one-message range', () => {
    const json = buildSummaryEmbed(result, {
      ...context,
      firstMessageId: context.lastMessageId,
    }).toJSON();
    const range = (json.fields ?? []).find(
      (field) => field.name === '🔗 Диапазон',
    );

    expect(range?.value).toContain('[сообщение]');
    expect(range?.value).not.toContain('первое сообщение');
  });

  it('marks count-truncated ranges in the footer', () => {
    const json = buildSummaryEmbed(result, {
      ...context,
      truncatedByCount: true,
    }).toJSON();

    expect(json.footer?.text).toContain('диапазон ограничен count');
  });

  it('keeps long values within Discord limits', () => {
    const json = buildSummaryEmbed(
      {
        summary: 's'.repeat(5000),
        topics: ['t'.repeat(500), 'u'.repeat(500)],
        decisions: ['d'.repeat(500)],
      },
      context,
    ).toJSON();

    expect(json.description?.length).toBeLessThanOrEqual(4096);
    for (const field of json.fields ?? []) {
      expect(field.value.length).toBeLessThanOrEqual(1024);
    }
  });

  it('uses a placeholder for an empty summary', () => {
    const json = buildSummaryEmbed(
      { summary: '', topics: [], decisions: [] },
      context,
    ).toJSON();

    expect(json.description).toBe('—');
  });
});
