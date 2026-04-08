import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { GitInfoService } from '#common/git-info.service';

import { GitInfoCommands } from './commands/git-info.commands';
import { BotEntity } from './entities/bot.entity';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotsManagerService } from './bots-manager.service';

@Module({
  imports: [MikroOrmModule.forFeature([BotEntity])],
  providers: [BotsService, BotsManagerService, GitInfoService, GitInfoCommands],
  controllers: [BotsController],
  exports: [BotsService],
})
export class BotsModule {}
