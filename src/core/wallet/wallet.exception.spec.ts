import { describe, expect, it } from 'bun:test';

import { InsufficientFundsException } from './wallet.exception';

describe('InsufficientFundsException', () => {
  it('is a BadRequestException with balance info', () => {
    const err = new InsufficientFundsException(100n, 500n);

    expect(err.getStatus()).toBe(400);
    expect(err.message).toContain('100');
    expect(err.message).toContain('500');
  });
});
