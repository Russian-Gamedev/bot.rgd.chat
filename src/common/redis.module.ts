import {
  type BeforeApplicationShutdown,
  Global,
  Logger,
  Module,
  Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { EnvironmentVariables } from '#config/env';

const REDIS_SHUTDOWN_TIMEOUT_MS = 5_000;

export class RedisConnectionService implements BeforeApplicationShutdown {
  private readonly logger = new Logger(RedisConnectionService.name);
  private shutdownStarted = false;

  constructor(readonly client: Redis) {}

  async beforeApplicationShutdown() {
    if (this.shutdownStarted) {
      return;
    }

    this.shutdownStarted = true;

    try {
      await this.quitWithTimeout();
      this.logger.log('Redis connection closed gracefully');
    } catch (error) {
      this.logger.warn(
        `Graceful Redis shutdown failed, disconnecting immediately: ${String(error)}`,
      );
      this.client.disconnect(false);
    }
  }

  private async quitWithTimeout() {
    await Promise.race([
      this.client.quit(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Redis quit timed out'));
        }, REDIS_SHUTDOWN_TIMEOUT_MS).unref();
      }),
    ]);
  }
}

const redisConnectionProvider: Provider = {
  useFactory: (config: ConfigService<EnvironmentVariables>) => {
    const logger = new Logger('RedisModule');
    const client = new Redis(
      config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
    client.once('connect', () => {
      logger.log('Connected to Redis');
    });
    return new RedisConnectionService(client);
  },
  inject: [ConfigService],
  provide: RedisConnectionService,
};

const redisProvider: Provider = {
  useFactory: (connection: RedisConnectionService) => connection.client,
  inject: [RedisConnectionService],
  provide: Redis,
};

@Global()
@Module({
  providers: [redisConnectionProvider, redisProvider],
  exports: [redisProvider],
})
export class RedisModule {}
