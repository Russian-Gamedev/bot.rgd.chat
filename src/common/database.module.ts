import { MikroOrmMiddleware, MikroOrmModule } from '@mikro-orm/nestjs';
import { MikroORM } from '@mikro-orm/postgresql';
import { Logger, MiddlewareConsumer, Module } from '@nestjs/common';

import { Environment } from '#config/env';
import config from '#root/mikro-orm.config';

@Module({
  imports: [MikroOrmModule.forRoot({ ...config, autoLoadEntities: true })],
})
export class DatabaseModule {
  private logger = new Logger(DatabaseModule.name);

  constructor(private readonly orm: MikroORM) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Environment: ' + process.env.NODE_ENV);
    if (process.env.NODE_ENV === Environment.Development) {
      await this.orm.schema.update();
      this.logger.log('Running migrations in development environment');
    } else {
      const pendingMigrations = await this.orm.migrator.getPending();
      if (pendingMigrations.length === 0) {
        this.logger.log('No pending migrations');
        return;
      }
      this.logger.log(`Pending migrations: `);
      this.logger.log(
        pendingMigrations.map((migration) => migration.name).join('\n'),
      );
      this.logger.log('Run migration up');
      await this.orm.migrator.up();
      this.logger.log('Migration end');
    }
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MikroOrmMiddleware).forRoutes('*');
  }
}
