import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Baker, { type ICron } from 'cronbake';

@Injectable()
export class SchedulerRegistry implements OnModuleDestroy {
  private readonly logger = new Logger(SchedulerRegistry.name);
  private readonly baker: Baker;
  private readonly intervals = new Map<string, Timer>();
  private readonly timeouts = new Map<string, Timer>();

  constructor() {
    this.baker = Baker.create();
  }

  getBaker(): Baker {
    return this.baker;
  }

  // --- Cron Jobs ---

  getCronJob(name: string): ICron {
    const jobs = this.baker.getAllJobs();
    const job = jobs.get(name);
    if (!job) {
      throw new Error(`No cron job was found with the given name "${name}"`);
    }
    return job;
  }

  getCronJobs(): Map<string, ICron> {
    return this.baker.getAllJobs();
  }

  deleteCronJob(name: string): void {
    this.logger.debug(`Deleting cron job "${name}"`);
    this.baker.destroy(name);
  }

  // --- Intervals ---

  addInterval(name: string, ref: Timer): void {
    this.logger.debug(`Adding interval "${name}"`);
    if (this.intervals.has(name)) {
      throw new Error(`Interval with the given name "${name}" already exists`);
    }
    this.intervals.set(name, ref);
  }

  getInterval(name: string): Timer {
    const ref = this.intervals.get(name);
    if (!ref) {
      throw new Error(`No interval was found with the given name "${name}"`);
    }
    return ref;
  }

  getIntervals(): Map<string, Timer> {
    return this.intervals;
  }

  deleteInterval(name: string): void {
    this.logger.debug(`Deleting interval "${name}"`);
    const ref = this.intervals.get(name);
    if (!ref) {
      throw new Error(`No interval was found with the given name "${name}"`);
    }
    clearInterval(ref);
    this.intervals.delete(name);
  }

  // --- Timeouts ---

  addTimeout(name: string, ref: Timer): void {
    this.logger.debug(`Adding timeout "${name}"`);
    if (this.timeouts.has(name)) {
      throw new Error(`Timeout with the given name "${name}" already exists`);
    }
    this.timeouts.set(name, ref);
  }

  getTimeout(name: string): Timer {
    const ref = this.timeouts.get(name);
    if (!ref) {
      throw new Error(`No timeout was found with the given name "${name}"`);
    }
    return ref;
  }

  getTimeouts(): Map<string, Timer> {
    return this.timeouts;
  }

  deleteTimeout(name: string): void {
    this.logger.debug(`Deleting timeout "${name}"`);
    const ref = this.timeouts.get(name);
    if (!ref) {
      throw new Error(`No timeout was found with the given name "${name}"`);
    }
    clearTimeout(ref);
    this.timeouts.delete(name);
  }

  // --- Lifecycle ---

  onModuleDestroy(): void {
    this.logger.debug('Cleaning up all scheduled jobs');
    this.baker.destroyAll();

    for (const [name, ref] of this.intervals) {
      clearInterval(ref);
      this.logger.debug(`Cleared interval "${name}"`);
    }
    this.intervals.clear();

    for (const [name, ref] of this.timeouts) {
      clearTimeout(ref);
      this.logger.debug(`Cleared timeout "${name}"`);
    }
    this.timeouts.clear();
  }
}
