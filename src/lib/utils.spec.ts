import { describe, expect, it } from 'bun:test';

import { formatCoins, formatTime } from '#root/lib/utils';

describe('formatCoins', () => {
  it('formats small numbers', () => {
    expect(formatCoins(0n)).toBe('0');
    expect(formatCoins(100n)).toBe('100');
  });

  it('formats large numbers with locale separators', () => {
    const result = formatCoins(1_000_000n);
    // Russian locale uses non-breaking space as thousands separator
    expect(result.replace(/\s/g, ' ')).toBe('1 000 000');
  });

  it('formats negative amounts', () => {
    const result = formatCoins(-500n);
    expect(result).toContain('500');
  });
});

describe('formatTime', () => {
  it('formats time correctly', () => {
    expect(formatTime(0)).toBe('');
    expect(formatTime(1)).toBe('1 сек.');
    expect(formatTime(59)).toBe('59 сек.');
    expect(formatTime(60)).toBe('1 мин.');
    expect(formatTime(61)).toBe('1 мин. 1 сек.');
    expect(formatTime(3600)).toBe('1 ч.');
    expect(formatTime(3661)).toBe('1 ч. 1 мин. 1 сек.');
    expect(formatTime(86400)).toBe('1 дн.');
    expect(formatTime(90061)).toBe('1 дн. 1 ч. 1 мин. 1 сек.');
    expect(formatTime(25 * 86400 + 1 * 3600)).toBe('3 нед. 4 дн. 1 ч.');
    expect(formatTime(30 * 86400 + 5 * 3600)).toBe('1 мес. 5 ч.');
    expect(formatTime(31_536_000)).toBe('1 год.');
    expect(formatTime(63_072_000)).toBe('2 год.');
  });
  it('formats time with negative values correctly', () => {
    expect(formatTime(-3601)).toBe('1 ч. 1 сек.');
    expect(formatTime(-3660)).toBe('1 ч. 1 мин.');
    expect(formatTime(-86401)).toBe('1 дн. 1 сек.');
  });
});
