import { Global, Module } from '@nestjs/common';

import { AppLifecycleService } from './app-lifecycle.service';
import { GitInfoService } from './git-info.service';
import { RedisModule } from './redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [GitInfoService, AppLifecycleService],
  exports: [GitInfoService, AppLifecycleService],
})
export class CommonServicesModule {}
