import { Module } from '@nestjs/common';

import { UtilsService } from './utils.service';
import { UtilsWatcher } from './utils.watcher';

@Module({
  providers: [UtilsService, UtilsWatcher],
})
export class UtilsModule {}
