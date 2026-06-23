import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { PermissionsModule } from '#core/permissions/permissions.module';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';
import { GuildSettingsModule } from '../settings/guild-settings.module';
import { MotdCommands } from './commands/motd.command';
import { MotdEntity } from './entities/motd.entity';
import { MotdController } from './motd.controller';
import { MotdService } from './motd.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([MotdEntity]),
    PermissionsModule,
    UserModule,
    WalletModule,
    GuildSettingsModule,
  ],
  controllers: [MotdController],
  providers: [MotdService, MotdCommands],
  exports: [MotdService],
})
export class MotdModule {}
