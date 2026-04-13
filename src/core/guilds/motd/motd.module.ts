import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { MotdCommands } from './commands/motd.command';
import { MotdEntity } from './entities/motd.entity';
import { MotdService } from './motd.service';

@Module({
  imports: [MikroOrmModule.forFeature([MotdEntity]), UserModule, WalletModule],
  providers: [MotdService, MotdCommands],
  exports: [MotdService],
})
export class MotdModule {}
