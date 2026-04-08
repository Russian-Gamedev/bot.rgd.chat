# ScheduleModule

Custom NestJS scheduler module powered by [cronbake](https://github.com/chaqchase/cronbake). Drop-in replacement for `@nestjs/schedule` with the same decorator API.

## Setup

Register once in your root module:

```ts
import { ScheduleModule } from '#common/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
})
export class AppModule {}
```

## Decorators

### `@Cron(expression, options?)`

Runs a method on a cron schedule.

```ts
import { Cron } from '#common/schedule';

@Injectable()
export class TaskService {
  // 5-field (standard) — seconds field is auto-prepended as 0
  @Cron('0 15 * * *')
  dailyAt15() {}

  // 6-field (cronbake native: sec min hr day mon dow)
  @Cron('30 0 9 * * 1-5')
  weekdayAt9_00_30() {}

  // Preset
  @Cron('@daily')
  daily() {}

  // With options
  @Cron('0 8 * * *', { name: 'morning-job', timeZone: 'Europe/Moscow' })
  morning() {}
}
```

**Cron expression format** — 6 fields (cronbake): `sec min hr day mon dow`

5-field expressions (standard cron without seconds) are automatically normalized by prepending `0` for the seconds field.

**Presets:** `@every_second`, `@every_minute`, `@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly` / `@annually`, `@every_<n>_<unit>`, `@at_<h>:<m>`, `@on_<day>`, `@between_<h>_<h>`

**`CronOptions`**

| Option     | Type     | Description                                                     |
| ---------- | -------- | --------------------------------------------------------------- |
| `name`     | `string` | Custom job name. Defaults to `ClassName.method`.                |
| `timeZone` | `string` | Stored in metadata. Not applied by cronbake (known limitation). |

---

### `@Interval(timeout, options?)`

### `@Interval(name, timeout, options?)`

Runs a method repeatedly on a fixed interval.

```ts
import { Interval } from '#common/schedule';

@Injectable()
export class TaskService {
  // Every 60 seconds
  @Interval(60_000)
  everyMinute() {}

  // Named interval
  @Interval('voice-sync', 60_000)
  syncVoice() {}

  // Fire immediately on app start, then every 5 minutes
  @Interval(5 * 60_000, { fireOnStart: true })
  syncOnStart() {}

  // Named + fireOnStart
  @Interval('initial-sync', 5 * 60_000, { fireOnStart: true })
  namedSyncOnStart() {}
}
```

**`IntervalOptions`**

| Option        | Type      | Default | Description                                                                      |
| ------------- | --------- | ------- | -------------------------------------------------------------------------------- |
| `fireOnStart` | `boolean` | `false` | Call the method immediately when the app starts, before the first interval tick. |

---

### `@Timeout(delay, options?)`

### `@Timeout(name, delay)`

Runs a method once after a delay.

```ts
import { Timeout } from '#common/schedule';

@Injectable()
export class TaskService {
  @Timeout(5000)
  fiveSecondsAfterStart() {}

  @Timeout('warmup', 2000)
  namedWarmup() {}
}
```

---

## SchedulerRegistry

`SchedulerRegistry` is exported and injectable. Use it to inspect or control jobs at runtime.

```ts
import { SchedulerRegistry } from '#common/schedule';

@Injectable()
export class AdminService {
  constructor(private readonly registry: SchedulerRegistry) {}

  // Cron jobs
  getCronJob(name: string) {
    return this.registry.getCronJob(name);
  }
  getAllCronJobs() {
    return this.registry.getCronJobs();
  }
  stopCronJob(name: string) {
    this.registry.deleteCronJob(name);
  }

  // Intervals
  stopInterval(name: string) {
    this.registry.deleteInterval(name);
  }
  getAllIntervals() {
    return this.registry.getIntervals();
  }

  // Timeouts
  cancelTimeout(name: string) {
    this.registry.deleteTimeout(name);
  }
  getAllTimeouts() {
    return this.registry.getTimeouts();
  }
}
```

**Cron job methods** (delegates to `cronbake` `Baker`):

| Method                | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `getCronJob(name)`    | Returns the `ICron` instance. Throws if not found.                |
| `getCronJobs()`       | Returns `Map<string, ICron>` of all registered cron jobs.         |
| `deleteCronJob(name)` | Destroys and removes a cron job.                                  |
| `getBaker()`          | Returns the underlying `Baker` instance for full cronbake access. |

**Interval methods:**

| Method                   | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `addInterval(name, ref)` | Register a `Timer` ref under a name.           |
| `getInterval(name)`      | Returns the `Timer`. Throws if not found.      |
| `getIntervals()`         | Returns `Map<string, Timer>` of all intervals. |
| `deleteInterval(name)`   | Clears and removes the interval.               |

**Timeout methods:**

| Method                  | Description                                   |
| ----------------------- | --------------------------------------------- |
| `addTimeout(name, ref)` | Register a `Timer` ref under a name.          |
| `getTimeout(name)`      | Returns the `Timer`. Throws if not found.     |
| `getTimeouts()`         | Returns `Map<string, Timer>` of all timeouts. |
| `deleteTimeout(name)`   | Clears and removes the timeout.               |

---

## Job naming

If no `name` is provided in decorator options, the job name is auto-generated as `ClassName.methodName`:

```ts
class ActivityWatchService {
  @Interval(60_000)
  saveAllVoiceActivities() {}
  // → registered as "ActivityWatchService.saveAllVoiceActivities"
}
```

---

## Known limitations

- **`timeZone`** option in `@Cron` is stored in metadata but not applied — cronbake does not support timezone-aware scheduling natively.
- All jobs are **in-memory only** — no persistence across restarts.
