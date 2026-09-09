import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { NicknameCommands } from './commands/nickname.commands';
import { NicknameHistoryEntity } from './entities/nickname-history.entity';
import { NicknameService } from './nickname.service';
import { NicknameWatcher } from './nickname.watcher';

@Module({
  imports: [
    MikroOrmModule.forFeature([NicknameHistoryEntity]),
    UserModule,
    WalletModule,
  ],
  providers: [NicknameService, NicknameCommands, NicknameWatcher],
  exports: [NicknameService],
})
export class NicknameModule {}
