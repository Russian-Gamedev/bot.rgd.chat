import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Client } from 'discord.js';
import { Context, type ContextOf, On, Once } from 'necord';

import { GuildInviteService } from './invite.service';

@Injectable()
export class GuildInviteWatcher {
  private readonly logger = new Logger(GuildInviteWatcher.name);

  constructor(
    private readonly guildInviteService: GuildInviteService,
    private discord: Client,
  ) {}

  @Once('clientReady')
  async onReady() {
    this.logger.log('GuildInviteWatcher is ready and listening for events.');
    await this.syncInvitesForAllGuilds();
  }

  @On('inviteCreate')
  async onInviteCreate(@Context() [invite]: ContextOf<'inviteCreate'>) {
    this.logger.log(
      `Invite created: ${invite.code} for guild ${invite.guild?.id}`,
    );
    await this.guildInviteService.create(invite);
  }

  @On('inviteDelete')
  async onInviteDelete(@Context() [invite]: ContextOf<'inviteDelete'>) {
    this.logger.log(
      `Invite deleted: ${invite.code} for guild ${invite.guild?.id}`,
    );
    await this.guildInviteService.delete(invite);
  }

  /// Sync invites for all guilds every 1 hour
  @Cron('0 */1 * * *')
  private async syncInvitesForAllGuilds() {
    const guilds = this.discord.guilds.cache.values();
    for (const guild of guilds) {
      await this.guildInviteService.syncGuildInvites(guild.id);
    }
  }
}
