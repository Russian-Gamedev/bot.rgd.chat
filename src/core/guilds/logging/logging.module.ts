import { Module } from '@nestjs/common';

import { GuildSettingsModule } from '../settings/guild-settings.module';
import { GuildLoggingService } from './guild-logging.service';

@Module({
  imports: [GuildSettingsModule],
  providers: [GuildLoggingService],
  exports: [GuildLoggingService],
})
export class GuildLoggingModule {}
