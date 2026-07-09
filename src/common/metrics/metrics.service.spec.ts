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

    metrics.recordActivityIncrement({
      guildId: '222222222222222222',
      roleSegment: 'moderator',
      kind: 'message',
      amount: 3,
    });

    const output = await metrics.getMetrics();
    expect(output).toContain('rgd_bot_activity_increment_total');
    expect(output).toContain('guild_id="222222222222222222"');
    expect(output).toContain('role_segment="moderator"');
    expect(output).not.toContain('user_id=');
    expect(output).not.toContain('message_id=');
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
