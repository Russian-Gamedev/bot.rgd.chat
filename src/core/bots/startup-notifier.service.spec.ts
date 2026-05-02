import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Client } from 'discord.js';

import {
  type AppLifecycleService,
  type AppStartupContext,
} from '#common/app-lifecycle.service';
import { type GitInfo, type GitInfoService } from '#common/git-info.service';
import { Environment } from '#config/env';

import { StartupNotifierService } from './startup-notifier.service';

const gitInfo: GitInfo = {
  branch: 'main',
  commit: 'abcdef1234567890',
  commitMessage: 'Ship startup notifier',
  shortCommit: 'abcdef1',
  branchLink: 'https://example.com/branch',
  commitLink: 'https://example.com/commit',
};

const startupContext: AppStartupContext = {
  reason: 'same_version_restart',
  currentStart: {
    schemaVersion: 1,
    instanceId: 'instance-current',
    branch: 'main',
    commit: gitInfo.commit,
    restartCount: 2,
    startedAt: '2026-05-02T12:00:00.000Z',
  },
};

function createService(options?: {
  channel?: {
    isSendable: () => boolean;
    send?: ReturnType<typeof mock>;
    type?: string;
  };
  fetchError?: Error;
}) {
  const fetch = mock(async () => {
    if (options?.fetchError) {
      throw options.fetchError;
    }

    return options?.channel ?? null;
  });
  const discord = {
    channels: {
      fetch,
    },
  } as unknown as Client;
  const gitInfoService = {
    getGitInfo: () => gitInfo,
  } as GitInfoService;
  const appLifecycleService = {
    getStartupContext: async () => startupContext,
  } as AppLifecycleService;
  const service = new StartupNotifierService(
    discord,
    gitInfoService,
    appLifecycleService,
  );
  const logger = {
    log: mock<(message: string) => void>(() => undefined),
    warn: mock<(message: string) => void>(() => undefined),
    error: mock<(message: string) => void>(() => undefined),
  };

  (service as unknown as { logger: typeof logger }).logger = logger;

  return {
    service,
    fetch,
    logger,
  };
}

describe('StartupNotifierService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDebugChannelId = process.env.DEBUG_CHANNEL_ID;

  beforeEach(() => {
    process.env.NODE_ENV = Environment.Production;
    process.env.DEBUG_CHANNEL_ID = '1234567890';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.DEBUG_CHANNEL_ID = originalDebugChannelId;
  });

  it('sends the startup notification in production when the channel is sendable', async () => {
    const send = mock(async () => undefined);
    const { service, fetch, logger } = createService({
      channel: {
        isSendable: () => true,
        send,
        type: 'GuildText',
      },
    });

    await service.onReady();

    expect(fetch).toHaveBeenCalledWith('1234567890');
    expect(send).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledTimes(1);
  });

  it('skips sending in development', async () => {
    process.env.NODE_ENV = Environment.Development;
    const { service, fetch } = createService();

    await service.onReady();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('warns when DEBUG_CHANNEL_ID is missing', async () => {
    process.env.DEBUG_CHANNEL_ID = '   ';
    const { service, fetch, logger } = createService();

    await service.onReady();

    expect(fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('warns when the channel is not found', async () => {
    const { service, logger } = createService();

    await service.onReady();

    expect(logger.warn).toHaveBeenCalledWith(
      'Startup notification channel 1234567890 was not found',
    );
  });

  it('warns when the channel is not sendable', async () => {
    const { service, logger } = createService({
      channel: {
        isSendable: () => false,
        type: 'GuildVoice',
      },
    });

    await service.onReady();

    expect(logger.warn).toHaveBeenCalledWith(
      'Startup notification channel 1234567890 is not sendable (type=GuildVoice)',
    );
  });

  it('logs an error when fetch fails', async () => {
    const { service, logger } = createService({
      fetchError: new Error('Missing Access'),
    });

    await service.onReady();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0] ?? '').toContain('Missing Access');
  });

  it('logs an error when send fails', async () => {
    const { service, logger } = createService({
      channel: {
        isSendable: () => true,
        send: mock(async () => {
          throw new Error('Cannot send messages to this user');
        }),
        type: 'GuildText',
      },
    });

    await service.onReady();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]?.[0] ?? '').toContain(
      'Cannot send messages to this user',
    );
  });
});
