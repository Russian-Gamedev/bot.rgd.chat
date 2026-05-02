import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { GitInfoCommands } from './commands/git-info.commands';
import { BotEntity } from './entities/bot.entity';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotsManagerService } from './bots-manager.service';
import { StartupNotifierService } from './startup-notifier.service';

@Module({
  imports: [MikroOrmModule.forFeature([BotEntity])],
  providers: [
    BotsService,
    BotsManagerService,
    GitInfoCommands,
    StartupNotifierService,
  ],
  controllers: [BotsController],
  exports: [BotsService],
})
export class BotsModule {}
