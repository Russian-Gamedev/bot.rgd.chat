import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { PermissionsModule } from '#core/permissions/permissions.module';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';

import { GuildEventsCommands } from './commands/events.command';
import { GuildEventEntity } from './entities/events.entity';
import { GuildEventsController } from './guild-events.controller';
import { GuildEventService } from './guild-events.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([GuildEventEntity]),
    PermissionsModule,
    UserModule,
    WalletModule,
  ],
  controllers: [GuildEventsController],
  providers: [GuildEventService, GuildEventsCommands],
  exports: [GuildEventService],
})
export class GuildEventsModule {}
