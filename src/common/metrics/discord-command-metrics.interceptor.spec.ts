import { describe, expect, it } from 'bun:test';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, type Observable, of, throwError } from 'rxjs';

import { DiscordCommandMetricsInterceptor } from './discord-command-metrics.interceptor';
import { MetricsService } from './metrics.service';

function createContext(
  interaction: unknown,
  type: string = 'necord',
): ExecutionContext {
  return {
    getType: () => type,
    getArgByIndex: () => interaction,
  } as unknown as ExecutionContext;
}

function createInteraction(overrides: Record<string, unknown> = {}) {
  return {
    isChatInputCommand: () => true,
    isContextMenuCommand: () => false,
    commandName: 'activity',
    guildId: '222222222222222222',
    member: null,
    options: { getSubcommand: () => null },
    ...overrides,
  };
}

function createHandler<T>(observable: Observable<T>): CallHandler {
  return { handle: () => observable };
}

describe('DiscordCommandMetricsInterceptor', () => {
  it('records successful slash command executions', async () => {
    const metrics = new MetricsService();
    metrics.registerGuild('222222222222222222', 'Test Guild');
    const interceptor = new DiscordCommandMetricsInterceptor(metrics);

    await lastValueFrom(
      interceptor.intercept(
        createContext(createInteraction()),
        createHandler(of(1)),
      ),
    );

    const output = await metrics.getMetrics();
    expect(output).toContain('rgd_bot_discord_command_total');
    expect(output).toContain('command="activity"');
    expect(output).toContain('guild_name="test_guild"');
    expect(output).toContain('status="success"');
  });

  it('records failed slash command executions and rethrows', async () => {
    const metrics = new MetricsService();
    const interceptor = new DiscordCommandMetricsInterceptor(metrics);

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext(createInteraction()),
          createHandler(throwError(() => new Error('boom'))),
        ),
      ),
    ).rejects.toThrow('boom');

    const output = await metrics.getMetrics();
    expect(output).toContain('command="activity"');
    expect(output).toContain('status="error"');
  });

  it('records subcommands with a compound name', async () => {
    const metrics = new MetricsService();
    const interceptor = new DiscordCommandMetricsInterceptor(metrics);

    await lastValueFrom(
      interceptor.intercept(
        createContext(
          createInteraction({ options: { getSubcommand: () => 'top' } }),
        ),
        createHandler(of(1)),
      ),
    );

    const output = await metrics.getMetrics();
    expect(output).toContain('command="activity_top"');
  });

  it('ignores non-command Necord contexts such as message listeners', async () => {
    const metrics = new MetricsService();
    const interceptor = new DiscordCommandMetricsInterceptor(metrics);

    await lastValueFrom(
      interceptor.intercept(
        createContext({ content: 'hello' }),
        createHandler(of(1)),
      ),
    );

    const output = await metrics.getMetrics();
    expect(output).not.toContain('rgd_bot_discord_command_total{');
  });

  it('ignores non-Necord contexts', async () => {
    const metrics = new MetricsService();
    const interceptor = new DiscordCommandMetricsInterceptor(metrics);

    await lastValueFrom(
      interceptor.intercept(
        createContext(createInteraction(), 'http'),
        createHandler(of(1)),
      ),
    );

    const output = await metrics.getMetrics();
    expect(output).not.toContain('rgd_bot_discord_command_total{');
  });
});
