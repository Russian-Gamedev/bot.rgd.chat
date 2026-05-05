import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { RedisModule } from '#common/redis.module';
import { BotsModule } from '#core/bots/bots.module';
import { GuildSettingsModule } from '#core/guilds/settings/guild-settings.module';
import { commands } from './commands';
import { MahoragaCaseEntity } from './entities/mahoraga-case.entity';
import { MahoragaController } from './mahoraga.controller';
import { MahoragaService } from './mahoraga.service';
import { MahoragaWatcher } from './mahoraga.watcher';
import { MahoragaCaseService } from './mahoraga-case.service';
import { MahoragaDetectionService } from './mahoraga-detection.service';
import { MahoragaDiscordService } from './mahoraga-discord.service';
import { MahoragaVerificationService } from './mahoraga-verification.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([MahoragaCaseEntity]),
    RedisModule,
    GuildSettingsModule,
    BotsModule,
  ],
  controllers: [MahoragaController],
  providers: [
    MahoragaCaseService,
    MahoragaDetectionService,
    MahoragaDiscordService,
    MahoragaVerificationService,
    MahoragaService,
    MahoragaWatcher,
    ...commands,
  ],
  exports: [MahoragaService],
})
export class MahoragaModule {}
