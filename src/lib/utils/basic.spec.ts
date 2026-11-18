import { describe, expect, it } from 'bun:test';

import { pickWeighted, randomInt } from './basic';

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

describe('randomInt', () => {
  it('always stays within the inclusive range', () => {
    for (let i = 0; i < 500; i++) {
      const value = randomInt(-3, 3);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('returns the only value when min equals max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it('reaches both bounds over many rolls', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      seen.add(randomInt(1, 2));
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });
});
