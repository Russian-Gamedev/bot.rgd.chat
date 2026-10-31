import { describe, expect, it } from 'bun:test';

import { LINES, PAYOUTS, REEL } from './slot.game';

describe('SlotGame odds', () => {
  it('uses the 18-cell reel and all eight lines', () => {
    expect(REEL.length).toBe(18);
    expect(LINES.length).toBe(8);
  });

  it('returns 258% of the stake in expectation', () => {
    const symbolCounts = new Map<string, number>();
    for (const symbol of REEL) {
      symbolCounts.set(symbol, (symbolCounts.get(symbol) ?? 0) + 1);
    }

    let expectedReturn = 0;
    for (const [symbol, count] of symbolCounts) {
      const payout = PAYOUTS[symbol];
      if (payout === undefined) {
        throw new Error(`Missing payout for reel symbol ${symbol}`);
      }

      expectedReturn += (count / REEL.length) ** 3 * payout;
    }
    expectedReturn *= LINES.length;

    expect(expectedReturn).toBeCloseTo(2.5826, 3);
  });
});
