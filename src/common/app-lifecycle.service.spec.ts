import { describe, expect, it, mock } from 'bun:test';
import Redis from 'ioredis';

import {
  APP_LIFECYCLE_LAST_START_KEY,
  APP_LIFECYCLE_LAST_STOP_KEY,
  AppLifecycleService,
  type AppLifecycleStartRecord,
  type AppLifecycleStopRecord,
  createShutdownLogPayload,
  createStartupLogPayload,
  determineStartupReason,
} from './app-lifecycle.service';
import { type GitInfoService } from './git-info.service';

function createStartRecord(
  overrides: Partial<AppLifecycleStartRecord> = {},
): AppLifecycleStartRecord {
  return {
    schemaVersion: 1,
    instanceId: 'instance-a',
    branch: 'main',
    commit: 'abcdef1234567890',
    startedAt: '2026-05-02T12:00:00.000Z',
    ...overrides,
  };
}

function createStopRecord(
  overrides: Partial<AppLifecycleStopRecord> = {},
): AppLifecycleStopRecord {
  return {
    schemaVersion: 1,
    instanceId: 'instance-a',
    branch: 'main',
    commit: 'abcdef1234567890',
    stoppedAt: '2026-05-02T12:10:00.000Z',
    signal: 'SIGTERM',
    graceful: true,
    ...overrides,
  };
}

function createRedisMock(initialState: Record<string, string> = {}) {
  const storage = new Map(Object.entries(initialState));

  return {
    storage,
    get: mock(async (key: string) => storage.get(key) ?? null),
    set: mock(async (key: string, value: string) => {
      storage.set(key, value);
      return 'OK';
    }),
  } as unknown as Redis & {
    storage: Map<string, string>;
    get: ReturnType<typeof mock>;
    set: ReturnType<typeof mock>;
  };
}

function createGitInfoService(commit = 'abcdef1234567890') {
  return {
    getGitInfo: () => ({
      branch: 'main',
      commit,
      commitMessage: 'Test commit',
      shortCommit: commit.slice(0, 7),
      branchLink: 'https://example.com/branch',
      commitLink: 'https://example.com/commit',
    }),
  } as GitInfoService;
}

describe('determineStartupReason', () => {
  it('returns new_version when previous commit differs', () => {
    const reason = determineStartupReason(
      createStartRecord({ commit: 'oldcommit1234567' }),
      createStopRecord(),
      'newcommit1234567',
    );

    expect(reason).toBe('new_version');
  });

  it('returns same_version_restart when previous shutdown was graceful', () => {
    const previousStart = createStartRecord();
    const previousStop = createStopRecord({
      instanceId: previousStart.instanceId,
      commit: previousStart.commit,
    });

    const reason = determineStartupReason(
      previousStart,
      previousStop,
      previousStart.commit,
    );

    expect(reason).toBe('same_version_restart');
  });

  it('returns crash_restart when stop record is missing for the previous instance', () => {
    const previousStart = createStartRecord();
    const previousStop = createStopRecord({ instanceId: 'older-instance' });

    const reason = determineStartupReason(
      previousStart,
      previousStop,
      previousStart.commit,
    );

    expect(reason).toBe('crash_restart');
  });

  it('returns initial_start when no previous start record exists', () => {
    const reason = determineStartupReason(
      undefined,
      createStopRecord(),
      'abcdef1234567890',
    );

    expect(reason).toBe('initial_start');
  });
});

describe('AppLifecycleService', () => {
  it('loads previous lifecycle state and stores the current startup record', async () => {
    const previousStart = createStartRecord({
      instanceId: 'instance-prev',
      commit: 'oldcommit1234567',
    });
    const previousStop = createStopRecord({
      instanceId: previousStart.instanceId,
      commit: previousStart.commit,
    });
    const redis = createRedisMock({
      [APP_LIFECYCLE_LAST_START_KEY]: JSON.stringify(previousStart),
      [APP_LIFECYCLE_LAST_STOP_KEY]: JSON.stringify(previousStop),
    });
    const service = new AppLifecycleService(
      redis,
      createGitInfoService('newcommit1234567'),
    );

    await service.onApplicationBootstrap();

    const startupContext = await service.getStartupContext();
    expect(startupContext.reason).toBe('new_version');
    expect(startupContext.previousStart).toEqual(previousStart);
    expect(startupContext.previousStop).toEqual(previousStop);

    const rawCurrentStart = redis.storage.get(APP_LIFECYCLE_LAST_START_KEY);
    expect(rawCurrentStart).toBeString();

    const currentStart = JSON.parse(
      rawCurrentStart!,
    ) as AppLifecycleStartRecord;
    expect(currentStart.commit).toBe('newcommit1234567');
    expect(currentStart.instanceId).toBeString();
    expect(currentStart.instanceId).not.toBe(previousStart.instanceId);
  });

  it('persists graceful shutdown details with signal', async () => {
    const redis = createRedisMock();
    const service = new AppLifecycleService(redis, createGitInfoService());

    await service.onApplicationBootstrap();
    await service.beforeApplicationShutdown('SIGTERM');

    const rawStopRecord = redis.storage.get(APP_LIFECYCLE_LAST_STOP_KEY);
    expect(rawStopRecord).toBeString();

    const stopRecord = JSON.parse(rawStopRecord!) as AppLifecycleStopRecord;
    expect(stopRecord.commit).toBe('abcdef1234567890');
    expect(stopRecord.signal).toBe('SIGTERM');
    expect(stopRecord.graceful).toBe(true);
  });
});

describe('lifecycle log payloads', () => {
  it('includes commit and previous shutdown details in the startup payload', () => {
    const previousStart = createStartRecord({
      instanceId: 'instance-prev',
      commit: 'oldcommit1234567',
    });
    const previousStop = createStopRecord({
      instanceId: previousStart.instanceId,
      commit: previousStart.commit,
      signal: 'SIGTERM',
    });
    const payload = createStartupLogPayload({
      reason: 'new_version',
      currentStart: createStartRecord({
        instanceId: 'instance-current',
        commit: 'newcommit1234567',
      }),
      previousStart,
      previousStop,
    });

    expect(payload.currentCommit).toBe('newcommit1234567');
    expect(payload.previousCommit).toBe('oldcommit1234567');
    expect(payload.previousGraceful).toBe(true);
    expect(payload.previousSignal).toBe('SIGTERM');
  });

  it('includes commit, signal and graceful marker in the shutdown payload', () => {
    const payload = createShutdownLogPayload(
      createStopRecord({
        commit: 'abcdef1234567890',
        signal: 'SIGTERM',
        graceful: true,
      }),
    );

    expect(payload.commit).toBe('abcdef1234567890');
    expect(payload.signal).toBe('SIGTERM');
    expect(payload.graceful).toBe(true);
  });
});
