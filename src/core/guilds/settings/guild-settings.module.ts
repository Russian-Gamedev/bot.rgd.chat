import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { commands } from './commands';
import { GuildSettingsEntity } from './entities/guild-settings.entity';
import { GuildSettingsService } from './guild-settings.service';

@Module({
  imports: [MikroOrmModule.forFeature([GuildSettingsEntity])],
  providers: [GuildSettingsService, ...commands],
  exports: [GuildSettingsService],
})
export class GuildSettingsModule {}
