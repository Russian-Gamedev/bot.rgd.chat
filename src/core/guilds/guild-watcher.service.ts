import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { AuditLogEvent, Client, Guild, SnowflakeUtil } from 'discord.js';
import { Context, type ContextOf, On } from 'necord';

import { GuildEvents } from '#config/guilds';
import { GuildMemberRolesService } from '#core/guilds/roles/guild-member-roles.service';
import { UserService } from '#core/users/users.service';

import { GuildEventService } from './events/guild-events.service';
import { GuildInviteService } from './invite/invite.service';
import { GuildSettingsService } from './settings/guild-settings.service';

@Injectable()
export class GuildWatcherService {
  private readonly logger = new Logger(GuildWatcherService.name);

  constructor(
    private readonly em: EntityManager,
    readonly _discord: Client,
    private readonly guildSettingsService: GuildSettingsService,
    private readonly guildEventsService: GuildEventService,
    private readonly userService: UserService,
    private readonly guildMemberRolesService: GuildMemberRolesService,
    private readonly guildInviteService: GuildInviteService,
  ) {}

  @EnsureRequestContext()
  @On('guildMemberAdd')
  async onMemberJoin(@Context() [member]: ContextOf<'guildMemberAdd'>) {
    this.logger.log(
      `Member ${member.displayName} joined guild ${member.guild.name}`,
    );
    const guild = await member.guild.fetch();
    if (!guild) return;

    const user = await this.userService.findOrCreateMember(guild.id, member.id);

    const isNewUser = user.isLeftGuild === false;

    if (!isNewUser) {
      await this.userService.rejoinGuild(user);
      await this.guildMemberRolesService.restoreSavedRoles(user);
    }

    const invite = await this.guildInviteService.findInviteWithUpdatedUses(
      guild.id,
    );

    if (!invite) {
      this.logger.warn(
        `No invite found for guild ${guild.id} when ${member.displayName} joined.`,
      );
    } else {
      this.logger.log(
        `Member ${member.displayName} joined using invite ${invite.id}.`,
      );

      await this.guildInviteService.trackJoin(user, invite.id);
    }

    const channel = await this.guildSettingsService.getEventMessageChannel(
      guild.id,
    );
    if (!channel) return;

    const event = isNewUser
      ? GuildEvents.MEMBER_FIRST_JOIN
      : GuildEvents.MEMBER_JOIN;

    let message = await this.guildEventsService.getRandom(guild.id, event, {
      user: `<@${member.id}>`,
    });

    message ??= 'Приветствуем <@' + member.id + '> на сервере!';

    if (!isNewUser) {
      message += `|| ${user.leftCount} раз||`;
    }

    await channel.send({
      content: message,
      nonce: SnowflakeUtil.generate().toString(),
      enforceNonce: true,
    });
  }

  @EnsureRequestContext()
  @On('guildMemberRemove')
  async onMemberLeave(@Context() [member]: ContextOf<'guildMemberRemove'>) {
    this.logger.log(
      `Member ${member.displayName} left guild ${member.guild.name}`,
    );
    const guild = await member.guild.fetch();
    if (!guild) return;

    const user = await this.userService.findOrCreateMember(guild.id, member.id);
    await this.userService.leaveGuild(user);
    await this.guildInviteService.trackLeave(user);

    const roles = member.roles.cache;

    if (roles.size === 0) return;

    this.logger.log(
      `Saving roles for user ${member.displayName} in guild ${member.guild.name}`,
    );
    await this.guildMemberRolesService.saveCurrentRoles(user, roles);

    const channel = await this.guildSettingsService.getEventMessageChannel(
      guild.id,
    );
    if (!channel) return;

    const { event, moderatorId } = await this.detectLeaveReason(
      guild,
      member.id,
    );

    const userStr = `[<@${member.id}>] **${member.displayName}**`;
    const moderatorStr = moderatorId ? `<@${moderatorId}>` : 'неизвестный';

    const params: Record<string, string> =
      event === GuildEvents.MEMBER_LEAVE
        ? { user: userStr }
        : { user: userStr, moderator: moderatorStr };

    let message = await this.guildEventsService.getRandom(
      guild.id,
      event,
      params,
    );

    if (!message) {
      switch (event) {
        case GuildEvents.MEMBER_BAN:
          message = `${userStr} был забанен ${moderatorStr}.`;
          break;
        case GuildEvents.MEMBER_KICK:
          message = `${userStr} был кикнут ${moderatorStr}.`;
          break;
        default:
          message = `<@${member.id}> покинул сервер.`;
      }
    }

    await channel.send(message);
  }

  async detectLeaveReason(
    guild: Guild,
    memberId: string,
  ): Promise<{ event: GuildEvents; moderatorId?: string }> {
    const banResult = await this.checkAuditEntry(
      guild,
      memberId,
      AuditLogEvent.MemberBanAdd,
    );
    if (banResult.found) {
      return {
        event: GuildEvents.MEMBER_BAN,
        moderatorId: banResult.moderatorId,
      };
    }

    const kickResult = await this.checkAuditEntry(
      guild,
      memberId,
      AuditLogEvent.MemberKick,
    );
    if (kickResult.found) {
      return {
        event: GuildEvents.MEMBER_KICK,
        moderatorId: kickResult.moderatorId,
      };
    }

    return { event: GuildEvents.MEMBER_LEAVE };
  }

  private async checkAuditEntry(
    guild: Guild,
    memberId: string,
    type: AuditLogEvent.MemberBanAdd | AuditLogEvent.MemberKick,
  ): Promise<{ found: boolean; moderatorId?: string }> {
    const RECENT_MS = 5000;
    const now = Date.now();

    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 1 });
      const entry = logs.entries.first();
      if (
        entry &&
        entry.target?.id === memberId &&
        now - entry.createdTimestamp <= RECENT_MS
      ) {
        return { found: true, moderatorId: entry.executor?.id };
      }
    } catch {
      this.logger.warn(
        `Could not fetch ${type} audit log for guild ${guild.id}`,
      );
    }

    return { found: false };
  }
}
