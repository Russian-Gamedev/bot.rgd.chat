import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { NicknameCommands } from './commands/nickname.commands';
import { NicknameHistoryEntity } from './entities/nickname-history.entity';
import { NicknameService } from './nickname.service';
import { NicknameWatcher } from './nickname.watcher';

@Module({
  imports: [MikroOrmModule.forFeature([NicknameHistoryEntity])],
  providers: [NicknameService, NicknameCommands, NicknameWatcher],
  exports: [NicknameService],
})
export class NicknameModule {}
