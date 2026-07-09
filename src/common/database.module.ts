import { MikroOrmMiddleware, MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM } from '@mikro-orm/postgresql';
import { Logger, MiddlewareConsumer, Module, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '#config/env';
import config from '#root/mikro-orm.config';
import { MetricsService } from './metrics/metrics.service';

@Module({
  imports: [MikroOrmModule.forRoot({ ...config, autoLoadEntities: true })],
})
export class DatabaseModule {
  private logger = new Logger(DatabaseModule.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly config: ConfigService<EnvironmentVariables>,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const startedAt = performance.now();
    const nodeEnv = this.config.getOrThrow<string>('NODE_ENV');
    this.logger.log('Environment: ' + nodeEnv);

    try {
      const pendingMigrations = await this.orm.migrator.getPending();
      if (pendingMigrations.length === 0) {
        this.logger.log('No pending migrations');
      } else {
        this.logger.log('Pending migrations:');
        this.logger.log(
          pendingMigrations.map((migration) => migration.name).join('\n'),
        );
        this.logger.log('Run migration up');
        await this.orm.migrator.up();
        this.logger.log('Migration end');
      }
      this.metrics?.observeMigrationDuration(
        'success',
        (performance.now() - startedAt) / 1000,
      );
    } catch (error) {
      this.metrics?.observeMigrationDuration(
        'error',
        (performance.now() - startedAt) / 1000,
      );
      throw error;
    }
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MikroOrmMiddleware).forRoutes('*');
  }
}
