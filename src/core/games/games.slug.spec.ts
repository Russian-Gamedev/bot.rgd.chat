import { describe, expect, it } from 'bun:test';
import { createGameSlug, normalizeGameSlug } from './games.slug';

describe('createGameSlug', () => {
  it('creates a lowercase title-based slug without a suffix', () => {
    expect(createGameSlug('  Моя новая игра!  ')).toBe('моя-новая-игра');
  });

  it('normalizes an explicitly edited slug', () => {
    expect(normalizeGameSlug(' Custom URL / Name ')).toBe('custom-url-name');
  });
});
