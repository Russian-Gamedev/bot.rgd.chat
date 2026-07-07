import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import {
  SCHEDULE_CRON_OPTIONS,
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULER_NAME,
} from '@nestjs/schedule/dist/schedule.constants';
import { Listener } from 'necord';

import { ActivityJobService } from '#core/activity/activity-job.service';
import { ActivityWatchService } from '#core/activity/activity-watch.service';
import { BarWatcher } from '#core/bar/bar.watcher';
import { BirthdayService } from '#core/birthday/birthday.service';
import { GuildService } from '#core/guilds/guild.service';
import { GuildWatcherService } from '#core/guilds/guild-watcher.service';
import { GuildInviteWatcher } from '#core/guilds/invite/invite-wather.service';
import { MotdService } from '#core/guilds/motd/motd.service';
import { NicknameWatcher } from '#core/nickname/nickname.watcher';
import { RoleReactionWatcher } from '#core/role-manager/role-reaction.watcher';

function getCronMetadata(service: object, methodName: string) {
  const method = service.constructor.prototype[methodName];

  return {
    name: Reflect.getMetadata(SCHEDULER_NAME, method),
    options: Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, method),
  };
}

function getIntervalMetadata(service: object, methodName: string) {
  const method = service.constructor.prototype[methodName];

  return {
    name: Reflect.getMetadata(SCHEDULER_NAME, method),
    options: Reflect.getMetadata(SCHEDULE_INTERVAL_OPTIONS, method),
  };
}

function getListenerMetadata(service: object, methodName: string) {
  const method = service.constructor.prototype[methodName];
  return Reflect.getMetadata(Listener.KEY, method);
}

const requestContextListeners = [
  [MotdService.prototype, 'onBotReady', 'once', 'clientReady'],
  [GuildService.prototype, 'onReady', 'once', 'clientReady'],
  [BarWatcher.prototype, 'onInit', 'once', 'clientReady'],
  [ActivityWatchService.prototype, 'onMessage', 'on', 'messageCreate'],
  [
    ActivityWatchService.prototype,
    'onVoiceStateUpdate',
    'on',
    'voiceStateUpdate',
  ],
  [ActivityWatchService.prototype, 'onReactionAdd', 'on', 'messageReactionAdd'],
  [
    ActivityWatchService.prototype,
    'onReactionRemove',
    'on',
    'messageReactionRemove',
  ],
  [GuildWatcherService.prototype, 'onMemberJoin', 'on', 'guildMemberAdd'],
  [GuildWatcherService.prototype, 'onMemberLeave', 'on', 'guildMemberRemove'],
  [GuildInviteWatcher.prototype, 'onInviteCreate', 'on', 'inviteCreate'],
  [GuildInviteWatcher.prototype, 'onInviteDelete', 'on', 'inviteDelete'],
  [NicknameWatcher.prototype, 'onGuildMemberUpdate', 'on', 'guildMemberUpdate'],
  [
    RoleReactionWatcher.prototype,
    'handleReactionAdded',
    'on',
    'messageReactionAdd',
  ],
  [
    RoleReactionWatcher.prototype,
    'handleReactionRemoved',
    'on',
    'messageReactionRemove',
  ],
] as const;

describe('scheduled job metadata', () => {
  it('keeps daily activity cron metadata after request context wrapping', () => {
    const metadata = getCronMetadata(
      ActivityJobService.prototype,
      'handleDailyJob',
    );

    expect(metadata.name).toBe('daily-activity');
    expect(metadata.options?.cronTime).toBe('0 15 * * *');
  });

  it('keeps birthday greeting cron metadata after request context wrapping', () => {
    const metadata = getCronMetadata(
      BirthdayService.prototype,
      'postBirthdayGreeting',
    );

    expect(metadata.name).toBe('birthday-greeting');
    expect(metadata.options?.cronTime).toBe('0 8 * * *');
  });

  it('keeps bot MOTD interval metadata after request context wrapping', () => {
    const metadata = getIntervalMetadata(
      MotdService.prototype,
      'setBotMotdInterval',
    );

    expect(metadata.name).toBe('bot-motd');
    expect(metadata.options?.timeout).toBe(60_000);
  });

  it('keeps listener metadata after request context wrapping', () => {
    for (const [service, methodName, type, event] of requestContextListeners) {
      const metadata = getListenerMetadata(service, methodName);

      expect(metadata?.getType()).toBe(type);
      expect(metadata?.getEvent()).toBe(event);
    }
  });
});
