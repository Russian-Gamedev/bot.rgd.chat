import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { Client, EmbedBuilder } from 'discord.js';

import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import { GuildLoggingService } from './guild-logging.service';

function createService(options?: {
  channelId?: string | null;
  channel?: { isSendable: () => boolean };
  sendError?: Error;
  guildFetchError?: Error;
}) {
  const getSetting = mock(async () => options?.channelId ?? null);
  const guildSettingsService = {
    getSetting,
  } as unknown as GuildSettingsService;

  const send = mock(async () => {
    if (options?.sendError) {
      throw options.sendError;
    }
  });
  const channelsFetch = mock(async () =>
    options?.channel ? { ...options.channel, send } : null,
  );
  const guild = { channels: { fetch: channelsFetch } };
  const guildsFetch = mock(async () => {
    if (options?.guildFetchError) {
      throw options.guildFetchError;
    }
    return guild;
  });
  const discord = { guilds: { fetch: guildsFetch } } as unknown as Client;

  const service = new GuildLoggingService(guildSettingsService, discord);
  const logger = {
    log: mock<(message: string) => void>(() => undefined),
    warn: mock<(message: string) => void>(() => undefined),
    error: mock<(message: string) => void>(() => undefined),
  };
  (service as unknown as { logger: typeof logger }).logger = logger;

  return {
    service,
    send,
    channelsFetch,
    guildsFetch,
    logger,
  };
}

describe('GuildLoggingService', () => {
  beforeEach(() => {
    mock.restore();
  });

  const embed = new EmbedBuilder().setTitle('Тест');

  it('does not send anything when the log channel is not configured', async () => {
    const { service, send, guildsFetch } = createService({ channelId: null });

    await service.log('123', embed);

    expect(guildsFetch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends only the embed to the configured channel', async () => {
    const { service, send, channelsFetch } = createService({
      channelId: '456',
      channel: { isSendable: () => true },
    });

    await service.log('123', embed);

    expect(channelsFetch).toHaveBeenCalledWith('456');
    expect(send).toHaveBeenCalledWith({ embeds: [embed] });
  });

  it('does not send when the configured channel is not sendable', async () => {
    const { service, send } = createService({
      channelId: '456',
      channel: { isSendable: () => false },
    });

    await service.log('123', embed);

    expect(send).not.toHaveBeenCalled();
  });

  it('returns null from getLogChannel when the guild fetch fails', async () => {
    const { service, send } = createService({
      channelId: '456',
      channel: { isSendable: () => true },
      guildFetchError: new Error('Unknown Guild'),
    });

    const channel = await service.getLogChannel('123');

    expect(channel).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows send failures and logs a warning', async () => {
    const { service, send, logger } = createService({
      channelId: '456',
      channel: { isSendable: () => true },
      sendError: new Error('Missing Access'),
    });

    await expect(service.log('123', embed)).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[0] ?? '').toContain('Missing Access');
  });
});
