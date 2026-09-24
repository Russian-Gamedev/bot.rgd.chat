import { describe, expect, it } from 'bun:test';

import { slugify } from './text';

describe('slugify', () => {
  it('transliterates russian and collapses separators', () => {
    expect(slugify('Котик играет в мяч!')).toBe('kotik-igraet-v-myach');
  });

  it('keeps latin letters and digits', () => {
    expect(slugify('Hello, World 2026!!')).toBe('hello-world-2026');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('🔥🎉')).toBe('');
  });

  it('truncates to the max length without a trailing dash', () => {
    expect(slugify('aa bb cc', 5)).toBe('aa-bb');
    expect(slugify('aa bb cc', 3)).toBe('aa');
  });
});
