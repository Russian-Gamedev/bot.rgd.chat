import { MikroOrmModule } from '@mikro-orm/nestjs';
import { forwardRef, Module } from '@nestjs/common';

import { BotsModule } from '#core/bots/bots.module';
import { UserEntity } from '#core/users/entities/user.entity';
import { UserModule } from '#core/users/users.module';

import { WalletTransactionEntity } from './entities/wallet-transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([WalletTransactionEntity, UserEntity]),
    forwardRef(() => UserModule),
    BotsModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
