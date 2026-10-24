import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import Redis from 'ioredis';

import { MetricsService } from '#common/metrics/metrics.service';

import { PatronTagService } from './patron-tag.service';

const PATRON_CACHE_KEY = 'users:patron-supporters';

describe('PatronTagService', () => {
  let service: PatronTagService;
  let redis: Redis & {
    transaction: {
      del: ReturnType<typeof mock>;
      hset: ReturnType<typeof mock>;
      expire: ReturnType<typeof mock>;
      exec: ReturnType<typeof mock>;
    };
  };
  let metrics: MetricsService;
  let previousFetch: typeof fetch;

  beforeEach(() => {
    previousFetch = globalThis.fetch;
    const transaction = {
      del: mock(() => undefined),
      hset: mock(() => undefined),
      expire: mock(() => undefined),
      exec: mock(async () => []),
    };
    redis = {
      hget: mock(() => Promise.resolve(null)),
      multi: mock(() => transaction),
      transaction,
    } as unknown as Redis & { transaction: typeof transaction };
    metrics = {
      recordScheduledJob: mock(() => undefined),
      setPatronSupporters: mock(() => undefined),
    } as unknown as MetricsService;

    service = new PatronTagService(redis, metrics);
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
  });

  it('returns a formatted patron tag from the cached hash', async () => {
    (redis.hget as ReturnType<typeof mock>).mockResolvedValueOnce('1500');

    await expect(service.getTag(123n)).resolves.toEqual({
      name: '1\u00A0500\u00A0\u20BD',
      color: '#5C87E7',
      background: '#FEFEFE',
      description: 'Донат',
    });
    expect(redis.hget).toHaveBeenCalledWith(PATRON_CACHE_KEY, '123');
  });

  it('does not return a tag for missing or non-positive values', async () => {
    await expect(service.getTag(123n)).resolves.toBeNull();

    (redis.hget as ReturnType<typeof mock>).mockResolvedValueOnce('0');
    await expect(service.getTag(123n)).resolves.toBeNull();

    (redis.hget as ReturnType<typeof mock>).mockResolvedValueOnce(
      'not-a-number',
    );
    await expect(service.getTag(123n)).resolves.toBeNull();
  });

  it('replaces the cached hash with positive supporters', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify([
            { user: { id: '123' }, value: 1500 },
            { user: { id: '456' }, value: 0 },
            { user: { id: '789' }, value: 'invalid' },
          ]),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    await service.refresh();

    expect(redis.transaction.del).toHaveBeenCalledWith(PATRON_CACHE_KEY);
    expect(redis.transaction.hset).toHaveBeenCalledWith(PATRON_CACHE_KEY, {
      '123': 1500,
    });
    expect(redis.transaction.expire).toHaveBeenCalledWith(
      PATRON_CACHE_KEY,
      86_400,
    );
    expect(redis.transaction.exec).toHaveBeenCalled();
    expect(metrics.setPatronSupporters).toHaveBeenCalledWith(1);
    expect(metrics.recordScheduledJob).toHaveBeenCalledWith(
      'patron_supporters',
      'success',
      expect.any(Number),
    );
  });

  it('clears the cached hash when there are no supporters', async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify([]), { status: 200 }),
    ) as unknown as typeof fetch;

    await service.refresh();

    expect(redis.transaction.del).toHaveBeenCalledWith(PATRON_CACHE_KEY);
    expect(redis.transaction.hset).not.toHaveBeenCalled();
    expect(redis.transaction.expire).not.toHaveBeenCalled();
    expect(redis.transaction.exec).toHaveBeenCalled();
    expect(metrics.setPatronSupporters).toHaveBeenCalledWith(0);
  });

  it('keeps the previous hash when the API request fails', async () => {
    globalThis.fetch = mock(
      async () => new Response('unavailable', { status: 503 }),
    ) as unknown as typeof fetch;

    await service.refresh();

    expect(redis.multi).not.toHaveBeenCalled();
    expect(metrics.recordScheduledJob).toHaveBeenCalledWith(
      'patron_supporters',
      'error',
      expect.any(Number),
    );
  });

  it('does not run two refreshes concurrently', async () => {
    let resolveFetch!: (response: Response) => void;
    globalThis.fetch = mock(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const first = service.refresh();
    const second = service.refresh();

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    resolveFetch(new Response(JSON.stringify([]), { status: 200 }));
    await Promise.all([first, second]);
  });
});
