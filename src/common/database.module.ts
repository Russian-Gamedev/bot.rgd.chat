import { MikroOrmMiddleware } from '@mikro-orm/nestjs';
import { type MiddlewareConsumer, Module } from '@nestjs/common';

@Module({})
export class DatabaseModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MikroOrmMiddleware).forRoutes('*');
  }
}
