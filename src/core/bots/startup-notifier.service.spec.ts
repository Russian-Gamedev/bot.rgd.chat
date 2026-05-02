import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { Client } from 'discord.js';

import {
  type AppLifecycleService,
  type AppStartupContext,
} from '#common/app-lifecycle.service';
import { type GitInfo, type GitInfoService } from '#common/git-info.service';
import { Environment, EnvironmentVariables } from '#config/env';

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
  nodeEnv?: Environment;
  debugChannelId?: string;
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
  const config = {
    get: (key: keyof EnvironmentVariables) => {
      if (key === 'DEBUG_CHANNEL_ID') {
        return options?.debugChannelId ?? '1234567890';
      }

      return undefined;
    },
    getOrThrow: (key: keyof EnvironmentVariables) => {
      if (key === 'NODE_ENV') {
        return options?.nodeEnv ?? Environment.Production;
      }

      throw new Error(`Missing config key ${key}`);
    },
  } as ConfigService<EnvironmentVariables>;
  const service = new StartupNotifierService(
    discord,
    gitInfoService,
    appLifecycleService,
    config,
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
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it('logs notifier initialization context', () => {
    const { service, logger } = createService();

    service.onModuleInit();

    expect(logger.log).toHaveBeenCalledWith(
      'Startup notifier initialized: NODE_ENV=production, DEBUG_CHANNEL_ID=1234567890',
    );
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
    expect(logger.log).toHaveBeenCalledWith(
      'Startup notifier clientReady: NODE_ENV=production, DEBUG_CHANNEL_ID=1234567890',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Startup notification sent to Discord channel 1234567890',
    );
  });

  it('skips sending in development', async () => {
    const { service, fetch, logger } = createService({
      nodeEnv: Environment.Development,
    });

    await service.onReady();

    expect(fetch).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'Startup notifier clientReady: NODE_ENV=development, DEBUG_CHANNEL_ID=1234567890',
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Skipping startup notification in development mode',
    );
  });

  it('warns when DEBUG_CHANNEL_ID is missing', async () => {
    const { service, fetch, logger } = createService({
      debugChannelId: '   ',
    });

    await service.onReady();

    expect(fetch).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'Startup notifier clientReady: NODE_ENV=production, DEBUG_CHANNEL_ID=missing',
    );
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
