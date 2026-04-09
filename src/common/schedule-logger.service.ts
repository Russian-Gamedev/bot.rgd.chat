import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';

@Injectable()
export class ScheduleLoggerService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Schedule');

  constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  onApplicationBootstrap(): void {
    const cronJobs = this.schedulerRegistry.getCronJobs();
    const intervals = this.schedulerRegistry.getIntervals();
    const timeouts = this.schedulerRegistry.getTimeouts();

    if (cronJobs.size > 0) {
      for (const [name, job] of cronJobs) {
        const next = job.nextDate().toISO();
        this.logger.log(`Cron "${name}" — next run: ${next}`);
      }
    }

    if (intervals.length > 0) {
      for (const name of intervals) {
        this.logger.log(`Interval "${name}" — active`);
      }
    }

    if (timeouts.length > 0) {
      for (const name of timeouts) {
        this.logger.log(`Timeout "${name}" — active`);
      }
    }

    this.logger.log(
      `Registered: ${cronJobs.size} cron, ${intervals.length} intervals, ${timeouts.length} timeouts`,
    );
  }
}
