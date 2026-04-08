/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';

import {
  Cron,
  type CronMetadata,
  Interval,
  type IntervalMetadata,
  type IntervalOptions,
  normalizeCronExpression,
  SCHEDULE_CRON_METADATA,
  SCHEDULE_INTERVAL_METADATA,
  SCHEDULE_TIMEOUT_METADATA,
  Timeout,
  type TimeoutMetadata,
} from '#common/schedule';
import { ScheduleExplorer } from '#common/schedule/schedule-explorer.service';
import { SchedulerRegistry } from '#common/schedule/scheduler-registry.service';

// ---------------------------------------------------------------------------
// normalizeCronExpression
// ---------------------------------------------------------------------------

describe('normalizeCronExpression', () => {
  it('prepends 0 to a 5-field expression', () => {
    expect(normalizeCronExpression('0 15 * * *')).toBe('0 0 15 * * *');
  });

  it('leaves a 6-field expression unchanged', () => {
    expect(normalizeCronExpression('30 0 15 * * *')).toBe('30 0 15 * * *');
  });

  it('leaves preset expressions unchanged', () => {
    expect(normalizeCronExpression('@daily')).toBe('@daily');
    expect(normalizeCronExpression('@every_minute')).toBe('@every_minute');
    expect(normalizeCronExpression('@every_5_seconds')).toBe(
      '@every_5_seconds',
    );
  });

  it('handles expressions with extra whitespace', () => {
    expect(normalizeCronExpression('  0 */1 * * *  ')).toBe('0 0 */1 * * *');
  });

  it('handles step expressions', () => {
    expect(normalizeCronExpression('*/30 * * * *')).toBe('0 */30 * * * *');
  });
});

// ---------------------------------------------------------------------------
// @Cron decorator
// ---------------------------------------------------------------------------

describe('@Cron decorator', () => {
  it('sets cron metadata on a method', () => {
    class TestService {
      @Cron('0 15 * * *')
      handleCron() {}
    }

    const metadata: CronMetadata = Reflect.getMetadata(
      SCHEDULE_CRON_METADATA,
      TestService.prototype.handleCron,
    );

    expect(metadata).toBeDefined();
    expect(metadata.cronExpression).toBe('0 15 * * *');
    expect(metadata.options).toEqual({});
  });

  it('stores name and timeZone options', () => {
    class TestService {
      @Cron('0 8 * * *', { name: 'daily-job', timeZone: 'Europe/Moscow' })
      handleCron() {}
    }

    const metadata: CronMetadata = Reflect.getMetadata(
      SCHEDULE_CRON_METADATA,
      TestService.prototype.handleCron,
    );

    expect(metadata.options.name).toBe('daily-job');
    expect(metadata.options.timeZone).toBe('Europe/Moscow');
  });
});

// ---------------------------------------------------------------------------
// @Interval decorator
// ---------------------------------------------------------------------------

describe('@Interval decorator', () => {
  it('sets interval metadata with timeout only', () => {
    class TestService {
      @Interval(5000)
      handleInterval() {}
    }

    const metadata: IntervalMetadata = Reflect.getMetadata(
      SCHEDULE_INTERVAL_METADATA,
      TestService.prototype.handleInterval,
    );

    expect(metadata).toBeDefined();
    expect(metadata.timeout).toBe(5000);
    expect(metadata.name).toBeUndefined();
  });

  it('sets interval metadata with name and timeout', () => {
    class TestService {
      @Interval('my-interval', 3000)
      handleInterval() {}
    }

    const metadata: IntervalMetadata = Reflect.getMetadata(
      SCHEDULE_INTERVAL_METADATA,
      TestService.prototype.handleInterval,
    );

    expect(metadata.name).toBe('my-interval');
    expect(metadata.timeout).toBe(3000);
  });

  it('sets fireOnStart option via timeout-only overload', () => {
    const options: IntervalOptions = { fireOnStart: true };
    class TestService {
      @Interval(1000, options)
      handleInterval() {}
    }

    const metadata: IntervalMetadata = Reflect.getMetadata(
      SCHEDULE_INTERVAL_METADATA,
      TestService.prototype.handleInterval,
    );

    expect(metadata.timeout).toBe(1000);
    expect(metadata.options.fireOnStart).toBe(true);
  });

  it('sets fireOnStart option via named overload', () => {
    const options: IntervalOptions = { fireOnStart: true };
    class TestService {
      @Interval('fire-interval', 2000, options)
      handleInterval() {}
    }

    const metadata: IntervalMetadata = Reflect.getMetadata(
      SCHEDULE_INTERVAL_METADATA,
      TestService.prototype.handleInterval,
    );

    expect(metadata.name).toBe('fire-interval');
    expect(metadata.timeout).toBe(2000);
    expect(metadata.options.fireOnStart).toBe(true);
  });

  it('defaults fireOnStart to falsy when not provided', () => {
    class TestService {
      @Interval(500)
      handleInterval() {}
    }

    const metadata: IntervalMetadata = Reflect.getMetadata(
      SCHEDULE_INTERVAL_METADATA,
      TestService.prototype.handleInterval,
    );

    expect(metadata.options.fireOnStart).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// @Timeout decorator
// ---------------------------------------------------------------------------

describe('@Timeout decorator', () => {
  it('sets timeout metadata with delay only', () => {
    class TestService {
      @Timeout(1000)
      handleTimeout() {}
    }

    const metadata: TimeoutMetadata = Reflect.getMetadata(
      SCHEDULE_TIMEOUT_METADATA,
      TestService.prototype.handleTimeout,
    );

    expect(metadata).toBeDefined();
    expect(metadata.timeout).toBe(1000);
    expect(metadata.name).toBeUndefined();
  });

  it('sets timeout metadata with name and delay', () => {
    class TestService {
      @Timeout('my-timeout', 2000)
      handleTimeout() {}
    }

    const metadata: TimeoutMetadata = Reflect.getMetadata(
      SCHEDULE_TIMEOUT_METADATA,
      TestService.prototype.handleTimeout,
    );

    expect(metadata.name).toBe('my-timeout');
    expect(metadata.timeout).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// SchedulerRegistry
// ---------------------------------------------------------------------------

describe('SchedulerRegistry', () => {
  let registry: SchedulerRegistry;

  beforeEach(() => {
    registry = new SchedulerRegistry();
  });

  afterEach(() => {
    registry.onModuleDestroy();
  });

  describe('cron jobs', () => {
    it('registers and retrieves a cron job via Baker', () => {
      const baker = registry.getBaker();
      baker.add({
        name: 'test-cron',
        cron: '@every_second',
        callback: () => {},
        start: false,
      });

      const job = registry.getCronJob('test-cron');
      expect(job).toBeDefined();
    });

    it('throws when getting a non-existent cron job', () => {
      expect(() => registry.getCronJob('missing')).toThrow(
        'No cron job was found with the given name "missing"',
      );
    });

    it('returns all cron jobs', () => {
      const baker = registry.getBaker();
      baker.add({
        name: 'job-a',
        cron: '@daily',
        callback: () => {},
        start: false,
      });
      baker.add({
        name: 'job-b',
        cron: '@hourly',
        callback: () => {},
        start: false,
      });

      const jobs = registry.getCronJobs();
      expect(jobs.size).toBe(2);
      expect(jobs.has('job-a')).toBe(true);
      expect(jobs.has('job-b')).toBe(true);
    });

    it('deletes a cron job', () => {
      const baker = registry.getBaker();
      baker.add({
        name: 'to-delete',
        cron: '@daily',
        callback: () => {},
        start: false,
      });

      registry.deleteCronJob('to-delete');
      expect(() => registry.getCronJob('to-delete')).toThrow();
    });
  });

  describe('intervals', () => {
    it('adds and retrieves an interval', () => {
      const ref = setInterval(() => {}, 10000);
      registry.addInterval('test-interval', ref);

      expect(registry.getInterval('test-interval')).toBe(ref);
      clearInterval(ref);
    });

    it('throws when adding a duplicate interval', () => {
      const ref = setInterval(() => {}, 10000);
      registry.addInterval('dup', ref);

      expect(() => registry.addInterval('dup', ref)).toThrow(
        'Interval with the given name "dup" already exists',
      );
      clearInterval(ref);
    });

    it('throws when getting a non-existent interval', () => {
      expect(() => registry.getInterval('missing')).toThrow(
        'No interval was found with the given name "missing"',
      );
    });

    it('deletes an interval', () => {
      const ref = setInterval(() => {}, 10000);
      registry.addInterval('to-delete', ref);

      registry.deleteInterval('to-delete');
      expect(() => registry.getInterval('to-delete')).toThrow();
    });

    it('returns all intervals', () => {
      const r1 = setInterval(() => {}, 10000);
      const r2 = setInterval(() => {}, 10000);
      registry.addInterval('a', r1);
      registry.addInterval('b', r2);

      const intervals = registry.getIntervals();
      expect(intervals.size).toBe(2);
      clearInterval(r1);
      clearInterval(r2);
    });
  });

  describe('timeouts', () => {
    it('adds and retrieves a timeout', () => {
      const ref = setTimeout(() => {}, 10000);
      registry.addTimeout('test-timeout', ref);

      expect(registry.getTimeout('test-timeout')).toBe(ref);
      clearTimeout(ref);
    });

    it('throws when adding a duplicate timeout', () => {
      const ref = setTimeout(() => {}, 10000);
      registry.addTimeout('dup', ref);

      expect(() => registry.addTimeout('dup', ref)).toThrow(
        'Timeout with the given name "dup" already exists',
      );
      clearTimeout(ref);
    });

    it('throws when getting a non-existent timeout', () => {
      expect(() => registry.getTimeout('missing')).toThrow(
        'No timeout was found with the given name "missing"',
      );
    });

    it('deletes a timeout', () => {
      const ref = setTimeout(() => {}, 10000);
      registry.addTimeout('to-delete', ref);

      registry.deleteTimeout('to-delete');
      expect(() => registry.getTimeout('to-delete')).toThrow();
    });

    it('returns all timeouts', () => {
      const r1 = setTimeout(() => {}, 10000);
      const r2 = setTimeout(() => {}, 10000);
      registry.addTimeout('a', r1);
      registry.addTimeout('b', r2);

      const timeouts = registry.getTimeouts();
      expect(timeouts.size).toBe(2);
      clearTimeout(r1);
      clearTimeout(r2);
    });
  });

  describe('onModuleDestroy', () => {
    it('clears all jobs, intervals, and timeouts', () => {
      const baker = registry.getBaker();
      baker.add({
        name: 'cron-1',
        cron: '@daily',
        callback: () => {},
        start: false,
      });

      const iRef = setInterval(() => {}, 10000);
      registry.addInterval('int-1', iRef);

      const tRef = setTimeout(() => {}, 10000);
      registry.addTimeout('timeout-1', tRef);

      registry.onModuleDestroy();

      expect(registry.getIntervals().size).toBe(0);
      expect(registry.getTimeouts().size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ScheduleExplorer
// ---------------------------------------------------------------------------

describe('ScheduleExplorer', () => {
  let registry: SchedulerRegistry;

  beforeEach(() => {
    registry = new SchedulerRegistry();
  });

  afterEach(() => {
    registry.onModuleDestroy();
  });

  function createExplorer(providers: { instance: object }[]): ScheduleExplorer {
    const discoveryService = {
      getProviders: () =>
        providers.map((p) => ({
          instance: p.instance,
          metatype: p.instance?.constructor,
        })),
    };

    const metadataScanner = {
      getAllMethodNames: (prototype: object) =>
        Object.getOwnPropertyNames(prototype).filter(
          (name) =>
            name !== 'constructor' &&
            typeof (prototype as any)[name] === 'function',
        ),
    };

    const reflector = {
      get: (key: string, target: any) => Reflect.getMetadata(key, target),
    };

    return new ScheduleExplorer(
      discoveryService as any,
      metadataScanner as any,
      reflector as any,
      registry,
    );
  }

  it('discovers and registers @Cron methods', () => {
    class TestService {
      @Cron('0 */1 * * *')
      myCronJob() {}
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    const job = registry.getCronJob('TestService.myCronJob');
    expect(job).toBeDefined();
  });

  it('uses the name from CronOptions when provided', () => {
    class TestService {
      @Cron('0 8 * * *', { name: 'custom-cron' })
      myCronJob() {}
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    const job = registry.getCronJob('custom-cron');
    expect(job).toBeDefined();
  });

  it('normalizes 5-field cron to 6-field when registering', () => {
    const bakerAddSpy = spyOn(registry.getBaker(), 'add');

    class TestService {
      @Cron('30 2 * * 1')
      weeklyJob() {}
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    expect(bakerAddSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cron: '0 30 2 * * 1' }),
    );
  });

  it('discovers and registers @Interval methods', () => {
    class TestService {
      @Interval(5000)
      myInterval() {}
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    const ref = registry.getInterval('TestService.myInterval');
    expect(ref).toBeDefined();
  });

  it('calls method immediately when fireOnStart is true', async () => {
    const handler = mock(() => Promise.resolve());

    class TestService {
      @Interval(60_000, { fireOnStart: true })
      myInterval() {
        return handler();
      }
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    // fireOnStart fires asynchronously — yield to microtask queue
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not call method immediately when fireOnStart is false', async () => {
    const handler = mock(() => Promise.resolve());

    class TestService {
      @Interval(60_000, { fireOnStart: false })
      myInterval() {
        return handler();
      }
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(handler).not.toHaveBeenCalled();
  });

  it('discovers and registers @Timeout methods', () => {
    class TestService {
      @Timeout(2000)
      myTimeout() {}
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    const ref = registry.getTimeout('TestService.myTimeout');
    expect(ref).toBeDefined();
  });

  it('uses custom names for @Interval and @Timeout', () => {
    class TestService {
      @Interval('named-interval', 1000)
      myInterval() {}

      @Timeout('named-timeout', 500)
      myTimeout() {}
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    expect(registry.getInterval('named-interval')).toBeDefined();
    expect(registry.getTimeout('named-timeout')).toBeDefined();
  });

  it('calls the bound method when cron fires', async () => {
    const handler = mock(() => {});

    class TestService {
      @Cron('@every_second')
      handler() {
        handler();
      }
    }

    const instance = new TestService();
    const explorer = createExplorer([{ instance }]);
    explorer.onModuleInit();

    // Wait enough time for at least one execution
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(handler).toHaveBeenCalled();
  });

  it('skips providers without instances', () => {
    const explorer = createExplorer([{ instance: null as any }]);
    // Should not throw
    expect(() => explorer.onModuleInit()).not.toThrow();
  });
});
