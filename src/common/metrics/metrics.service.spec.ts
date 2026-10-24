import { describe, expect, it } from 'bun:test';
import { PermissionsBitField } from 'discord.js';

import { MetricsService } from './metrics.service';
import {
  getRoleSegment,
  normalizeMetricLabel,
  normalizeRoleSegment,
} from './metrics.types';

describe('MetricsService', () => {
  it('records activity increments without identity labels', async () => {
    const metrics = new MetricsService();
    metrics.registerGuild('222222222222222222', 'Test Guild');

    metrics.recordActivityIncrement({
      guildId: '222222222222222222',
      roleSegment: 'moderator',
      kind: 'message',
      amount: 3,
    });

    const output = await metrics.getMetrics();
    expect(output).toContain('rgd_bot_activity_increment_total');
    expect(output).toContain('guild_id="222222222222222222"');
    expect(output).toContain('guild_name="test_guild"');
    expect(output).toContain('role_segment="moderator"');
    expect(output).not.toContain('user_id=');
    expect(output).not.toContain('message_id=');
  });

  it('tracks the last successful scheduled job timestamp', async () => {
    const metrics = new MetricsService();

    metrics.recordScheduledJob('daily_activity', 'success', 0.1);

    const output = await metrics.getMetrics();
    expect(output).toContain(
      'rgd_bot_scheduled_job_last_success_timestamp_seconds',
    );
    expect(output).toContain('task="daily_activity"');
  });

  it('records app startup reason, build info and restart count', async () => {
    const metrics = new MetricsService();

    metrics.recordAppStartup('crash_restart');
    metrics.setAppRestartCount(2);
    metrics.setBuildInfo('main', 'abcdef1');

    const output = await metrics.getMetrics();
    expect(output).toContain('rgd_bot_app_startup_total');
    expect(output).toContain('reason="crash_restart"');
    expect(output).toContain('rgd_bot_app_startup_reason');
    expect(output).toContain('rgd_bot_app_startup_timestamp_seconds');
    expect(output).toContain('rgd_bot_app_restart_count');
    expect(output).toContain('rgd_bot_build_info');
    expect(output).toContain('commit="abcdef1"');
  });

  it('records profile cache and sync metrics', async () => {
    const metrics = new MetricsService();

    metrics.recordProfileCacheLookup('miss');
    metrics.recordProfileSync('fresh', 0.3);

    const output = await metrics.getMetrics();
    expect(output).toContain('rgd_bot_profile_cache_lookups_total');
    expect(output).toContain('result="miss"');
    expect(output).toContain('rgd_bot_profile_sync_total');
    expect(output).toContain('result="fresh"');
  });

  it('tracks the number of cached patron supporters', async () => {
    const metrics = new MetricsService();

    metrics.setPatronSupporters(12);

    const output = await metrics.getMetrics();
    expect(output).toContain('rgd_bot_patron_supporters{app="rgd_bot"} 12');
  });

  it('sanitizes free-form labels and unknown role segments', () => {
    expect(normalizeMetricLabel('Coins:Daily Bonus!')).toBe(
      'coins:daily_bonus',
    );
    expect(normalizeRoleSegment('owner')).toBe('unknown');
  });

  it('derives fixed role segments from guild members', () => {
    expect(
      getRoleSegment({
        user: { bot: true },
        permissions: new PermissionsBitField(0n),
      } as never),
    ).toBe('bot');
    expect(
      getRoleSegment({
        user: { bot: false },
        permissions: new PermissionsBitField(
          PermissionsBitField.Flags.Administrator,
        ),
      } as never),
    ).toBe('admin');
    expect(
      getRoleSegment({
        user: { bot: false },
        permissions: {},
      } as never),
    ).toBe('unknown');
  });
});
