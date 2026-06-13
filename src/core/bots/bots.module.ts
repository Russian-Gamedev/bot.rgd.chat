import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotsManagerService } from './bots-manager.service';
import { GitInfoCommands } from './commands/git-info.commands';
import { BotEntity } from './entities/bot.entity';
import { StartupNotifierService } from './startup-notifier.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([BotEntity]),
    PermissionsModule,
    UserModule,
    WalletModule,
  ],
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
