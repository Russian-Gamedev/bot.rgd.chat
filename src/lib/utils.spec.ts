import { describe, expect, it } from 'bun:test';

import { formatCoins } from '#root/lib/utils';

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
