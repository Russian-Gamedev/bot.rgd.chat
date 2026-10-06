import { describe, expect, it } from 'bun:test';
import { createProjectSlug, normalizeProjectSlug } from './projects.slug';

describe('createProjectSlug', () => {
  it('creates a lowercase title-based slug without a suffix', () => {
    expect(createProjectSlug('  Моя новая игра!  ')).toBe('моя-новая-игра');
  });

  it('normalizes an explicitly edited slug', () => {
    expect(normalizeProjectSlug(' Custom URL / Name ')).toBe('custom-url-name');
  });
});
