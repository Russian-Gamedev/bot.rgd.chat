import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import { Environment } from '#config/env';

import { validate } from './validate';

const baseConfig = {
  PORT: '3000',
  BASE_URL: 'https://bot.rgd.chat',
  POSTGRES_URL: 'postgresql://root:secret@database:5432/bot-rgd-chat',
  REDIS_URL: 'redis://redis:6379',
  DISCORD_BOT_TOKEN: 'discord-token',
  DISCORD_CLIENT_ID: 'discord-client-id',
  DISCORD_REDIRECT_URI: 'https://bot.rgd.chat/auth/discord/callback',
  DISCORD_CLIENT_SECRET: 'discord-client-secret',
  JWT_SECRET: 'jwt-secret',
  TELEGRAM_BOT_TOKEN: 'telegram-token',
  TELEGRAM_API_ROOT: 'https://api.telegram.org',
};

describe('config validation', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalConsoleLog = console.log;

  beforeEach(() => {
    delete process.env.NODE_ENV;
    console.log = mock(() => undefined) as typeof console.log;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    console.log = originalConsoleLog;
  });

  it('fails when NODE_ENV is missing', () => {
    expect(() => validate(baseConfig)).toThrow('NODE_ENV');
  });

  it('allows production without DISCORD_DEVELOPMENT_GUILD_ID', () => {
    process.env.NODE_ENV = Environment.Production;

    const config = validate({
      ...baseConfig,
      NODE_ENV: Environment.Production,
    });

    expect(config.NODE_ENV).toBe(Environment.Production);
    expect(config.DISCORD_DEVELOPMENT_GUILD_ID).toBeUndefined();
  });

  it('requires DISCORD_DEVELOPMENT_GUILD_ID in development', () => {
    expect(() =>
      validate({
        ...baseConfig,
        NODE_ENV: Environment.Development,
      }),
    ).toThrow('DISCORD_DEVELOPMENT_GUILD_ID');
  });

  it('allows development with DISCORD_DEVELOPMENT_GUILD_ID', () => {
    process.env.NODE_ENV = Environment.Development;

    const config = validate({
      ...baseConfig,
      NODE_ENV: Environment.Development,
      DISCORD_DEVELOPMENT_GUILD_ID: '833744914898223126',
    });

    expect(config.NODE_ENV).toBe(Environment.Development);
    expect(config.DISCORD_DEVELOPMENT_GUILD_ID).toBe('833744914898223126');
  });
});
