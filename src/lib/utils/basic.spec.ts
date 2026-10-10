import { describe, expect, it } from 'bun:test';

import { pickWeighted } from './basic';

describe('pickWeighted', () => {
  it('returns the only item regardless of weight', () => {
    expect(pickWeighted(['a'], () => 0.001)).toBe('a');
  });

  it('never picks zero-weight items', () => {
    const picked = new Set<string>();
    for (let i = 0; i < 500; i++) {
      picked.add(
        pickWeighted(['a', 'b', 'c'], (item) => (item === 'c' ? 0 : 1)),
      );
    }
    expect(picked.has('c')).toBe(false);
  });

  it('picks proportionally to weights', () => {
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) {
      const picked = pickWeighted(['a', 'b'], (item) => (item === 'a' ? 3 : 1));
      counts[picked as keyof typeof counts]++;
    }
    expect(counts.a / counts.b).toBeGreaterThan(2);
    expect(counts.a / counts.b).toBeLessThan(4);
  });
});
