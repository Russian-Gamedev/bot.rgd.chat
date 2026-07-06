import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import {
  SCHEDULE_CRON_OPTIONS,
  SCHEDULER_NAME,
} from '@nestjs/schedule/dist/schedule.constants';

import { ActivityJobService } from '#core/activity/activity-job.service';
import { BirthdayService } from '#core/birthday/birthday.service';

function getCronMetadata(service: object, methodName: string) {
  const method = service.constructor.prototype[methodName];

  return {
    name: Reflect.getMetadata(SCHEDULER_NAME, method),
    options: Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, method),
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
});
