import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';

import {
  InvitesAliasCommand,
  InvitesCreateCommand,
  InvitesListCommand,
} from './commands/invites.command';
import { GuildInviteEntity } from './entities/invite.entity';
import { GuildInviteHistoryEntity } from './entities/invite-history.entity';
import { GuildInviteService } from './invite.service';
import { GuildInviteWatcher } from './invite-wather.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([GuildInviteEntity, GuildInviteHistoryEntity]),
  ],
  providers: [
    GuildInviteService,
    GuildInviteWatcher,
    InvitesAliasCommand,
    InvitesCreateCommand,
    InvitesListCommand,
  ],
  exports: [GuildInviteService],
})
export class GuildInviteModule {}
