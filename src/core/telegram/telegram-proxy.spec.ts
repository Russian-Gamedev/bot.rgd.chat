import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'bun:test';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { EnvironmentVariables } from '#config/env';

import {
  createTelegramModuleOptions,
  getTelegramProxyAgent,
  getTelegramSocksProxyUrl,
} from './telegram-proxy';

function createConfig(values: Record<string, string | undefined>) {
  return {
    get(key: string) {
      return values[key];
    },
    getOrThrow(key: string) {
      const value = values[key];
      if (!value) {
        throw new Error(`Missing config: ${key}`);
      }

      return value;
    },
  } as Pick<ConfigService<EnvironmentVariables>, 'get' | 'getOrThrow'>;
}

describe('telegram proxy config', () => {
  it('returns no proxy when TELEGRAM_SOCKS_PROXY_URL is not set', () => {
    const config = createConfig({});

    expect(getTelegramSocksProxyUrl(config)).toBeUndefined();
    expect(
      getTelegramProxyAgent(getTelegramSocksProxyUrl(config)),
    ).toBeUndefined();
  });

  it('creates a SocksProxyAgent when TELEGRAM_SOCKS_PROXY_URL is set', () => {
    const config = createConfig({
      TELEGRAM_SOCKS_PROXY_URL: '  socks5://127.0.0.1:1080  ',
    });

    const agent = getTelegramProxyAgent(getTelegramSocksProxyUrl(config));

    expect(agent).toBeInstanceOf(SocksProxyAgent);
  });
});

describe('createTelegramModuleOptions', () => {
  it('omits the Telegram agent when no proxy is configured', () => {
    const options = createTelegramModuleOptions(
      createConfig({
        TELEGRAM_BOT_TOKEN: 'telegram-token',
        TELEGRAM_API_ROOT: 'https://api.telegram.org',
      }),
    );

    expect(options.token).toBe('telegram-token');
    expect(options.options?.telegram?.apiRoot).toBe('https://api.telegram.org');
    expect(options.options?.telegram).not.toHaveProperty('agent');
  });

  it('includes the Telegram agent when a proxy is configured', () => {
    const options = createTelegramModuleOptions(
      createConfig({
        TELEGRAM_BOT_TOKEN: 'telegram-token',
        TELEGRAM_API_ROOT: 'https://api.telegram.org',
        TELEGRAM_SOCKS_PROXY_URL: 'socks5://127.0.0.1:1080',
      }),
    );

    expect(options.options?.telegram?.agent).toBeInstanceOf(SocksProxyAgent);
  });
});
