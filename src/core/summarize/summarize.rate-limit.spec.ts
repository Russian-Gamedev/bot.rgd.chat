import { describe, expect, it, mock } from 'bun:test';
import type Redis from 'ioredis';

import {
  isSummarizeRateLimited,
  summarizeRateLimitKey,
} from './summarize.rate-limit';

function makeRedis(count: number) {
  const incr = mock(async (_key: string) => count);
  const expire = mock(async (_key: string, _seconds: number) => 1);

  return {
    redis: { incr, expire } as unknown as Redis,
    incr,
    expire,
  };
}

describe('isSummarizeRateLimited', () => {
  it('allows three calls per day and blocks the fourth', async () => {
    const first = makeRedis(1);

    expect(await isSummarizeRateLimited(first.redis, 'guild', 'user')).toBe(
      false,
    );
    expect(first.expire).toHaveBeenCalledWith(
      'summarize:limit:guild:user',
      24 * 60 * 60,
    );

    expect(
      await isSummarizeRateLimited(makeRedis(2).redis, 'guild', 'user'),
    ).toBe(false);
    expect(
      await isSummarizeRateLimited(makeRedis(3).redis, 'guild', 'user'),
    ).toBe(false);
    expect(
      await isSummarizeRateLimited(makeRedis(4).redis, 'guild', 'user'),
    ).toBe(true);
  });

  it('does not count calls for administrators', async () => {
    const { redis, incr } = makeRedis(100);

    expect(await isSummarizeRateLimited(redis, 'guild', 'user', true)).toBe(
      false,
    );
    expect(incr).not.toHaveBeenCalled();
  });

  it('builds a per-guild per-user key', () => {
    expect(summarizeRateLimitKey('guild', 'user')).toBe(
      'summarize:limit:guild:user',
    );
  });
});
