import { describe, expect, it, mock } from 'bun:test';
import Redis from 'ioredis';

import { RedisConnectionService } from './redis.module';

function createRedisMock(options: { quitRejects?: boolean } = {}) {
  return {
    quit: mock(async () => {
      if (options.quitRejects) {
        throw new Error('quit failed');
      }

      return 'OK';
    }),
    disconnect: mock(() => undefined),
  } as unknown as Redis & {
    quit: ReturnType<typeof mock>;
    disconnect: ReturnType<typeof mock>;
  };
}

describe('RedisConnectionService', () => {
  it('closes Redis gracefully on shutdown', async () => {
    const redis = createRedisMock();
    const service = new RedisConnectionService(redis);

    await service.beforeApplicationShutdown();

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('does not close Redis twice', async () => {
    const redis = createRedisMock();
    const service = new RedisConnectionService(redis);

    await service.beforeApplicationShutdown();
    await service.beforeApplicationShutdown();

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects immediately when graceful Redis shutdown fails', async () => {
    const redis = createRedisMock({ quitRejects: true });
    const service = new RedisConnectionService(redis);

    await service.beforeApplicationShutdown();

    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).toHaveBeenCalledWith(false);
  });
});
