import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { PermissionsModule } from '#core/permissions/permissions.module';
import { UserModule } from '#core/users/users.module';
import { CoinsCommand } from './commands/coins.command';
import { WalletEntity } from './entities/wallet.entity';
import { WalletTransactionEntity } from './entities/wallet-transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([WalletEntity, WalletTransactionEntity]),
    UserModule,
    PermissionsModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, CoinsCommand],
  exports: [WalletService],
})
export class WalletModule {}
