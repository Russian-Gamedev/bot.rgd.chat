import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import { PermissionsModule } from '#core/permissions/permissions.module';
import { GuildEventsCommands } from './commands/events.command';
import { GuildEventEntity } from './entities/events.entity';
import { GuildEventsController } from './guild-events.controller';
import { GuildEventService } from './guild-events.service';

@Module({
  imports: [MikroOrmModule.forFeature([GuildEventEntity]), PermissionsModule],
  controllers: [GuildEventsController],
  providers: [GuildEventService, GuildEventsCommands],
  exports: [GuildEventService],
})
export class GuildEventsModule {}
