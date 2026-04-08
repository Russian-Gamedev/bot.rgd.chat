import { type DynamicModule, Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { ScheduleExplorer } from './schedule-explorer.service';
import { SchedulerRegistry } from './scheduler-registry.service';

@Global()
@Module({})
export class ScheduleModule {
  static forRoot(): DynamicModule {
    return {
      module: ScheduleModule,
      imports: [DiscoveryModule],
      providers: [SchedulerRegistry, ScheduleExplorer],
      exports: [SchedulerRegistry],
    };
  }
}
