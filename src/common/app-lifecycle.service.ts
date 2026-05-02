import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

import { type GitInfo, GitInfoService } from '#common/git-info.service';

export const APP_LIFECYCLE_LAST_START_KEY = 'app:lifecycle:last-start';
export const APP_LIFECYCLE_LAST_STOP_KEY = 'app:lifecycle:last-stop';
const APP_LIFECYCLE_SCHEMA_VERSION = 1;

export type StartupReason =
  | 'initial_start'
  | 'new_version'
  | 'same_version_restart'
  | 'crash_restart';

export interface AppLifecycleStartRecord {
  schemaVersion: number;
  instanceId: string;
  branch: string;
  commit: string;
  startedAt: string;
}

export interface AppLifecycleStopRecord {
  schemaVersion: number;
  instanceId: string;
  branch: string;
  commit: string;
  stoppedAt: string;
  signal: string | null;
  graceful: boolean;
}

export interface AppStartupContext {
  reason: StartupReason;
  currentStart: AppLifecycleStartRecord;
  previousStart?: AppLifecycleStartRecord;
  previousStop?: AppLifecycleStopRecord;
}

export interface StartupLogPayload {
  event: 'app_start';
  reason: StartupReason;
  currentInstanceId: string;
  currentCommit: string;
  currentBranch: string;
  previousInstanceId: string | null;
  previousCommit: string | null;
  previousGraceful: boolean | null;
  previousSignal: string | null;
}

export interface ShutdownLogPayload {
  event: 'app_stop';
  instanceId: string;
  commit: string;
  branch: string;
  graceful: boolean;
  signal: string | null;
}

export function determineStartupReason(
  previousStart: AppLifecycleStartRecord | undefined,
  previousStop: AppLifecycleStopRecord | undefined,
  currentCommit: string,
): StartupReason {
  if (!previousStart) {
    return 'initial_start';
  }

  if (previousStart.commit !== currentCommit) {
    return 'new_version';
  }

  if (
    previousStop?.instanceId === previousStart.instanceId &&
    previousStop.graceful
  ) {
    return 'same_version_restart';
  }

  return 'crash_restart';
}

export function describeStartupReason(reason: StartupReason): string {
  switch (reason) {
    case 'initial_start':
      return 'Первый запуск или состояние в Redis отсутствует';
    case 'new_version':
      return 'Новая версия';
    case 'same_version_restart':
      return 'Перезапуск той же версии';
    case 'crash_restart':
      return 'Нештатный рестарт после краша';
  }
}

export function createStartupLogPayload(
  startupContext: AppStartupContext,
): StartupLogPayload {
  const previousStopMatches =
    startupContext.previousStop?.instanceId ===
    startupContext.previousStart?.instanceId;

  return {
    event: 'app_start',
    reason: startupContext.reason,
    currentInstanceId: startupContext.currentStart.instanceId,
    currentCommit: startupContext.currentStart.commit,
    currentBranch: startupContext.currentStart.branch,
    previousInstanceId: startupContext.previousStart?.instanceId ?? null,
    previousCommit: startupContext.previousStart?.commit ?? null,
    previousGraceful: previousStopMatches
      ? (startupContext.previousStop?.graceful ?? null)
      : null,
    previousSignal: previousStopMatches
      ? (startupContext.previousStop?.signal ?? null)
      : null,
  };
}

export function createShutdownLogPayload(
  shutdownRecord: AppLifecycleStopRecord,
): ShutdownLogPayload {
  return {
    event: 'app_stop',
    instanceId: shutdownRecord.instanceId,
    commit: shutdownRecord.commit,
    branch: shutdownRecord.branch,
    graceful: shutdownRecord.graceful,
    signal: shutdownRecord.signal,
  };
}

@Injectable()
export class AppLifecycleService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(AppLifecycleService.name);
  private readonly instanceId = randomUUID();
  private readonly startupReady: Promise<void>;
  private readonly currentGitInfo: GitInfo;

  private resolveStartupReady!: () => void;
  private startupContext?: AppStartupContext;
  private shutdownSaved = false;

  constructor(
    @Inject(Redis) private readonly redis: Redis,
    private readonly gitInfoService: GitInfoService,
  ) {
    this.currentGitInfo = this.gitInfoService.getGitInfo();
    this.startupReady = new Promise((resolve) => {
      this.resolveStartupReady = resolve;
    });
  }

  async onApplicationBootstrap() {
    try {
      const [previousStart, previousStop] = await Promise.all([
        this.readRecord<AppLifecycleStartRecord>(APP_LIFECYCLE_LAST_START_KEY),
        this.readRecord<AppLifecycleStopRecord>(APP_LIFECYCLE_LAST_STOP_KEY),
      ]);

      const currentStart = this.createStartRecord();
      const reason = determineStartupReason(
        previousStart,
        previousStop,
        currentStart.commit,
      );

      this.startupContext = {
        reason,
        currentStart,
        previousStart,
        previousStop,
      };

      await this.writeRecord(APP_LIFECYCLE_LAST_START_KEY, currentStart);

      this.logger.log(
        `Lifecycle startup ${JSON.stringify(createStartupLogPayload(this.startupContext))}`,
      );
    } finally {
      this.resolveStartupReady();
    }
  }

  async beforeApplicationShutdown(signal?: string) {
    if (this.shutdownSaved) {
      return;
    }

    this.shutdownSaved = true;
    await this.startupReady;

    const shutdownRecord = this.createStopRecord(signal);
    await this.writeRecord(APP_LIFECYCLE_LAST_STOP_KEY, shutdownRecord);

    this.logger.log(
      `Lifecycle shutdown saved ${JSON.stringify(createShutdownLogPayload(shutdownRecord))}`,
    );
  }

  async getStartupContext(): Promise<AppStartupContext> {
    await this.startupReady;

    if (!this.startupContext) {
      throw new Error('Startup context is not initialized');
    }

    return this.startupContext;
  }

  private createStartRecord(): AppLifecycleStartRecord {
    return {
      schemaVersion: APP_LIFECYCLE_SCHEMA_VERSION,
      instanceId: this.instanceId,
      branch: this.currentGitInfo.branch,
      commit: this.currentGitInfo.commit,
      startedAt: new Date().toISOString(),
    };
  }

  private createStopRecord(signal?: string): AppLifecycleStopRecord {
    return {
      schemaVersion: APP_LIFECYCLE_SCHEMA_VERSION,
      instanceId: this.instanceId,
      branch: this.currentGitInfo.branch,
      commit: this.currentGitInfo.commit,
      stoppedAt: new Date().toISOString(),
      signal: signal ?? null,
      graceful: true,
    };
  }

  private async readRecord<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(key);
    if (!raw) {
      return undefined;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(
        `Failed to parse lifecycle record "${key}": ${String(error)}`,
      );
      return undefined;
    }
  }

  private async writeRecord(key: string, value: unknown) {
    await this.redis.set(key, JSON.stringify(value));
  }
}
