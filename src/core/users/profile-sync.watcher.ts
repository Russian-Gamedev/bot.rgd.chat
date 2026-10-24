import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Context, type ContextOf, On } from 'necord';

import { formatError } from '#lib/utils';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { PublicProfileService } from './public-profile.service';

@Injectable()
export class ProfileSyncWatcher {
  private readonly logger = new Logger(ProfileSyncWatcher.name);

  constructor(
    readonly em: EntityManager,
    private readonly discordProfileSync: DiscordProfileSyncService,
    private readonly publicProfileService: PublicProfileService,
  ) {}

  @On('userUpdate')
  @EnsureRequestContext()
  async onUserUpdate(@Context() [oldUser, newUser]: ContextOf<'userUpdate'>) {
    if (newUser.bot) return;

    try {
      await this.discordProfileSync.syncUser(newUser);
      await this.publicProfileService.invalidateProfileCache({
        user_id: BigInt(newUser.id),
        username: newUser.username,
      });

      if (oldUser.username && oldUser.username !== newUser.username) {
        await this.publicProfileService.invalidateProfileCache({
          user_id: BigInt(newUser.id),
          username: oldUser.username,
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to sync Discord user profile ${newUser.id}: ${formatError(error)}`,
      );
    }
  }

  @On('guildMemberUpdate')
  @EnsureRequestContext()
  async onGuildMemberUpdate(
    @Context() [, newMember]: ContextOf<'guildMemberUpdate'>,
  ) {
    if (newMember.user.bot) return;

    try {
      await this.discordProfileSync.syncMember(newMember);
      await this.publicProfileService.invalidateProfileCache({
        user_id: BigInt(newMember.id),
        username: newMember.user.username,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to sync guild member profile ${newMember.guild.id}/${newMember.id}: ${formatError(error)}`,
      );
    }
  }
}
