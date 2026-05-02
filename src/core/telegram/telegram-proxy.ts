import { ConfigService } from '@nestjs/config';
import { TelegrafModuleOptions } from 'nestjs-telegraf';
import type { Agent } from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { EnvironmentVariables } from '#config/env';

const telegramProxyAgents = new Map<string, SocksProxyAgent>();

type TelegramConfigReader = Pick<
  ConfigService<EnvironmentVariables>,
  'get' | 'getOrThrow'
>;

export function normalizeTelegramSocksProxyUrl(
  proxyUrl?: string | null,
): string | undefined {
  const normalizedProxyUrl = proxyUrl?.trim();
  if (!normalizedProxyUrl) return undefined;
  return normalizedProxyUrl;
}

export function getTelegramSocksProxyUrl(config: TelegramConfigReader) {
  return normalizeTelegramSocksProxyUrl(
    config.get<string>('TELEGRAM_SOCKS_PROXY_URL'),
  );
}

export function getTelegramProxyAgent(proxyUrl?: string): Agent | undefined {
  const normalizedProxyUrl = normalizeTelegramSocksProxyUrl(proxyUrl);
  if (!normalizedProxyUrl) return undefined;

  const cachedAgent = telegramProxyAgents.get(normalizedProxyUrl);
  if (cachedAgent) return cachedAgent;

  const agent = new SocksProxyAgent(normalizedProxyUrl);
  telegramProxyAgents.set(normalizedProxyUrl, agent);

  return agent;
}

export function createTelegramModuleOptions(
  config: TelegramConfigReader,
): TelegrafModuleOptions {
  const agent = getTelegramProxyAgent(getTelegramSocksProxyUrl(config));

  return {
    token: config.getOrThrow<string>('TELEGRAM_BOT_TOKEN'),
    options: {
      telegram: {
        apiRoot: config.getOrThrow<string>('TELEGRAM_API_ROOT'),
        ...(agent ? { agent } : {}),
      },
    },
  };
}
