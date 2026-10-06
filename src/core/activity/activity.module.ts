import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { RedisModule } from '#common/redis.module';
import { GuildEventsModule } from '#core/guilds/events/guild-events.module';
import { GuildMemberRolesModule } from '#core/guilds/roles/guild-member-roles.module';
import { GuildSettingsModule } from '#core/guilds/settings/guild-settings.module';
import { PermissionsModule } from '#core/permissions/permissions.module';
import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { UserModule } from '#core/users/users.module';
import { WalletModule } from '#core/wallet/wallet.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ActivityJobService } from './activity-job.service';
import { ActivityWatchService } from './activity-watch.service';
import { PruneCommand } from './commands/prune.command';
import { TopCommand } from './commands/top.command';
import { UserCommands } from './commands/user.command';
import { UserActivityDailyEntity } from './entities/user-activity-daily.entity';
import { UserActivityTotalEntity } from './entities/user-activity-total.entity';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      UserActivityDailyEntity,
      UserActivityTotalEntity,
      MemberProfileEntity,
    ]),
    RedisModule,
    PermissionsModule,
    GuildEventsModule,
    GuildMemberRolesModule,
    GuildSettingsModule,
    UserModule,
    WalletModule,
  ],
  controllers: [ActivityController],
  providers: [
    ActivityService,
    ActivityWatchService,
    ActivityJobService,
    UserCommands,
    TopCommand,
    PruneCommand,
  ],
  exports: [ActivityService],
})
export class ActivityModule {}
