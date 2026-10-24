import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DiscordCommandMetricsInterceptor } from './discord-command-metrics.interceptor';
import { MetricsController } from './metrics.controller';
import { MetricsHttpInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsHttpInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DiscordCommandMetricsInterceptor,
    },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
