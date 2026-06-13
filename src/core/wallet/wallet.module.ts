import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { BotsModule } from '#core/bots/bots.module';
import { GuildEventsModule } from '#core/guilds/events/guild-events.module';
import { GuildSettingsModule } from '#core/guilds/settings/guild-settings.module';
import { NicknameModule } from '#core/nickname/nickname.module';
import { UserModule } from '#core/users/users.module';
import { CoinsCommand } from './commands/coins.command';
import { RenameCommands } from './commands/rename.command';
import { WalletEntity } from './entities/wallet.entity';
import { WalletTransactionEntity } from './entities/wallet-transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([WalletEntity, WalletTransactionEntity]),
    UserModule,
    GuildEventsModule,
    GuildSettingsModule,
    NicknameModule,
    BotsModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, CoinsCommand, RenameCommands],
  exports: [WalletService],
})
export class WalletModule {}
