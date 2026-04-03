import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { UserModule } from '#core/users/users.module';

import { GuildEntity } from './entities/guild.entity';
import { RoleEntity } from './entities/role.entity';
import { GuildEventsModule } from './events/guild-events.module';
import { GuildInviteModule } from './invite/invite.module';
import { MotdModule } from './motd/motd.module';
import { GuildSettingsModule } from './settings/guild-settings.module';
import { GuildController } from './guild.controller';
import { GuildService } from './guild.service';
import { GuildWatcherService } from './guild-watcher.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([GuildEntity, RoleEntity]),
    GuildSettingsModule,
    GuildEventsModule,
    GuildInviteModule,
    MotdModule,
    UserModule,
  ],
  providers: [GuildService, GuildWatcherService],
  controllers: [GuildController],
  exports: [GuildService],
})
export class GuildModule {}
