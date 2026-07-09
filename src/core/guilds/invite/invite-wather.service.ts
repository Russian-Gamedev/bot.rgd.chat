import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Client } from 'discord.js';
import { Context, type ContextOf, On, Once } from 'necord';

import { MetricsService } from '#common/metrics/metrics.service';
import { GuildInviteService } from './invite.service';

@Injectable()
export class GuildInviteWatcher {
  private readonly logger = new Logger(GuildInviteWatcher.name);

  constructor(
    readonly em: EntityManager,
    private readonly guildInviteService: GuildInviteService,
    private discord: Client,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  @Once('clientReady')
  async onReady() {
    this.logger.log('GuildInviteWatcher is ready and listening for events.');
    await this.syncInvitesForAllGuilds();
  }

  @On('inviteCreate')
  @EnsureRequestContext()
  async onInviteCreate(@Context() [invite]: ContextOf<'inviteCreate'>) {
    this.logger.log(
      `Invite created: ${invite.code} for guild ${invite.guild?.id}`,
    );
    await this.guildInviteService.create(invite);
    this.metrics?.recordGuildEvent({
      guildId: invite.guild?.id,
      event: 'invite_create',
    });
  }

  @On('inviteDelete')
  @EnsureRequestContext()
  async onInviteDelete(@Context() [invite]: ContextOf<'inviteDelete'>) {
    this.logger.log(
      `Invite deleted: ${invite.code} for guild ${invite.guild?.id}`,
    );
    await this.guildInviteService.delete(invite);
    this.metrics?.recordGuildEvent({
      guildId: invite.guild?.id,
      event: 'invite_delete',
    });
  }

  /// Sync invites for all guilds every 1 hour
  @Cron(CronExpression.EVERY_HOUR, { name: 'sync-invites' })
  private async syncInvitesForAllGuilds() {
    const startedAt = performance.now();
    const guilds = this.discord.guilds.cache.values();
    try {
      for (const guild of guilds) {
        await this.guildInviteService.syncGuildInvites(guild.id);
      }
      this.metrics?.recordScheduledJob(
        'sync_invites',
        'success',
        (performance.now() - startedAt) / 1000,
      );
    } catch (error) {
      this.metrics?.recordScheduledJob(
        'sync_invites',
        'error',
        (performance.now() - startedAt) / 1000,
      );
      throw error;
    }
  }
}
