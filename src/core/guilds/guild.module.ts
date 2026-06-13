import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { PermissionsModule } from '#core/permissions/permissions.module';
import { UserModule } from '#core/users/users.module';

import { GuildEntity } from './entities/guild.entity';
import { RoleEntity } from './entities/role.entity';
import { GuildEventsModule } from './events/guild-events.module';
import { GuildController } from './guild.controller';
import { GuildService } from './guild.service';
import { GuildWatcherService } from './guild-watcher.service';
import { GuildInviteModule } from './invite/invite.module';
import { MotdModule } from './motd/motd.module';
import { GuildMemberRolesModule } from './roles/guild-member-roles.module';
import { GuildSettingsModule } from './settings/guild-settings.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([GuildEntity, RoleEntity]),
    GuildSettingsModule,
    GuildEventsModule,
    GuildInviteModule,
    MotdModule,
    GuildMemberRolesModule,
    PermissionsModule,
    UserModule,
  ],
  providers: [GuildService, GuildWatcherService],
  controllers: [GuildController],
  exports: [GuildService],
})
export class GuildModule {}
