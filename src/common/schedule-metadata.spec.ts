import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import {
  SCHEDULE_CRON_OPTIONS,
  SCHEDULE_INTERVAL_OPTIONS,
  SCHEDULER_NAME,
} from '@nestjs/schedule/dist/schedule.constants';

import { ActivityJobService } from '#core/activity/activity-job.service';
import { BirthdayService } from '#core/birthday/birthday.service';
import { MotdService } from '#core/guilds/motd/motd.service';

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
});
