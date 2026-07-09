import { Injectable } from '@nestjs/common';
import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

import {
  type MetricsStatus,
  normalizeMetricLabel,
  normalizeRoleSegment,
  type RoleSegment,
} from './metrics.types';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  private readonly httpRequests = new Counter({
    name: 'rgd_bot_http_requests_total',
    help: 'Total HTTP requests handled by the API.',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  private readonly httpRequestDuration = new Histogram({
    name: 'rgd_bot_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private readonly appLifecycleEvents = new Counter({
    name: 'rgd_bot_app_lifecycle_events_total',
    help: 'Application lifecycle events.',
    labelNames: ['event', 'status'] as const,
    registers: [this.registry],
  });

  private readonly migrationDuration = new Histogram({
    name: 'rgd_bot_migration_duration_seconds',
    help: 'Database migration check and apply duration in seconds.',
    labelNames: ['status'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    registers: [this.registry],
  });

  private readonly redisConnected = new Gauge({
    name: 'rgd_bot_redis_connected',
    help: 'Redis connection status, 1 for connected and 0 for disconnected.',
    registers: [this.registry],
  });

  private readonly redisErrors = new Counter({
    name: 'rgd_bot_redis_errors_total',
    help: 'Redis connection and command errors.',
    labelNames: ['operation'] as const,
    registers: [this.registry],
  });

  private readonly discordReady = new Gauge({
    name: 'rgd_bot_discord_ready',
    help: 'Discord client ready status, 1 for ready and 0 for not ready.',
    registers: [this.registry],
  });

  private readonly discordGuilds = new Gauge({
    name: 'rgd_bot_discord_guilds',
    help: 'Discord guilds visible to the bot.',
    registers: [this.registry],
  });

  private readonly watchedGuilds = new Gauge({
    name: 'rgd_bot_discord_watched_guilds',
    help: 'Guilds watched by project features.',
    labelNames: ['feature'] as const,
    registers: [this.registry],
  });

  private readonly scheduledJobs = new Counter({
    name: 'rgd_bot_scheduled_job_runs_total',
    help: 'Scheduled job executions.',
    labelNames: ['job', 'status'] as const,
    registers: [this.registry],
  });

  private readonly scheduledJobDuration = new Histogram({
    name: 'rgd_bot_scheduled_job_duration_seconds',
    help: 'Scheduled job execution duration in seconds.',
    labelNames: ['job', 'status'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    registers: [this.registry],
  });

  private readonly barClients = new Gauge({
    name: 'rgd_bot_bar_clients',
    help: 'Currently connected /bar websocket clients.',
    registers: [this.registry],
  });

  private readonly barEvents = new Counter({
    name: 'rgd_bot_bar_events_total',
    help: '/bar websocket events.',
    labelNames: ['event', 'status'] as const,
    registers: [this.registry],
  });

  private readonly discordCommands = new Counter({
    name: 'rgd_bot_discord_command_total',
    help: 'Discord command executions.',
    labelNames: ['command', 'guild_id', 'role_segment', 'status'] as const,
    registers: [this.registry],
  });

  private readonly activityIncrements = new Counter({
    name: 'rgd_bot_activity_increment_total',
    help: 'Activity increments recorded by kind.',
    labelNames: ['guild_id', 'role_segment', 'kind'] as const,
    registers: [this.registry],
  });

  private readonly walletTransactions = new Counter({
    name: 'rgd_bot_wallet_transactions_total',
    help: 'Wallet transactions by type and reason.',
    labelNames: ['guild_id', 'type', 'reason'] as const,
    registers: [this.registry],
  });

  private readonly walletCoinVolume = new Counter({
    name: 'rgd_bot_wallet_coin_volume_total',
    help: 'Wallet coin volume by type and reason.',
    labelNames: ['guild_id', 'type', 'reason'] as const,
    registers: [this.registry],
  });

  private readonly mahoragaDetections = new Counter({
    name: 'rgd_bot_mahoraga_detections_total',
    help: 'Mahoraga detections and actions.',
    labelNames: ['guild_id', 'reason', 'mode', 'status'] as const,
    registers: [this.registry],
  });

  private readonly guildEvents = new Counter({
    name: 'rgd_bot_guild_events_total',
    help: 'Guild member and invite events.',
    labelNames: ['guild_id', 'event'] as const,
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ app: 'rgd_bot' });
    collectDefaultMetrics({
      prefix: 'rgd_bot_',
      register: this.registry,
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  async getMetricValue(name: string, labels: Record<string, string>) {
    const metric = await this.registry.getSingleMetric(name)?.get();
    return metric?.values.find((value) =>
      Object.entries(labels).every(
        ([key, label]) => value.labels[key] === label,
      ),
    )?.value;
  }

  recordHttpRequest(input: {
    method: string;
    route: string;
    status: number;
    durationSeconds: number;
  }) {
    const labels = {
      method: normalizeMetricLabel(input.method).toUpperCase(),
      route: normalizeRouteLabel(input.route),
      status: String(input.status),
    };

    this.httpRequests.inc(labels);
    this.httpRequestDuration.observe(labels, input.durationSeconds);
  }

  recordAppLifecycleEvent(event: string, status: MetricsStatus) {
    this.appLifecycleEvents.inc({
      event: normalizeMetricLabel(event),
      status,
    });
  }

  observeMigrationDuration(status: MetricsStatus, durationSeconds: number) {
    this.migrationDuration.observe({ status }, durationSeconds);
  }

  setRedisConnected(connected: boolean) {
    this.redisConnected.set(connected ? 1 : 0);
  }

  recordRedisError(operation: string) {
    this.redisErrors.inc({ operation: normalizeMetricLabel(operation) });
  }

  setDiscordReady(ready: boolean) {
    this.discordReady.set(ready ? 1 : 0);
  }

  setDiscordGuildCount(count: number) {
    this.discordGuilds.set(count);
  }

  setWatchedGuildCount(feature: string, count: number) {
    this.watchedGuilds.set({ feature: normalizeMetricLabel(feature) }, count);
  }

  recordScheduledJob(
    job: string,
    status: MetricsStatus,
    durationSeconds: number,
  ) {
    const labels = {
      job: normalizeMetricLabel(job),
      status,
    };
    this.scheduledJobs.inc(labels);
    this.scheduledJobDuration.observe(labels, durationSeconds);
  }

  setBarClientCount(count: number) {
    this.barClients.set(count);
  }

  recordBarEvent(event: string, status: MetricsStatus = 'success') {
    this.barEvents.inc({
      event: normalizeMetricLabel(event),
      status,
    });
  }

  recordDiscordCommand(input: {
    command: string;
    guildId?: string | bigint | null;
    roleSegment?: RoleSegment | string | null;
    status: MetricsStatus;
  }) {
    this.discordCommands.inc({
      command: normalizeMetricLabel(input.command),
      guild_id: normalizeGuildId(input.guildId),
      role_segment: normalizeRoleSegment(input.roleSegment),
      status: input.status,
    });
  }

  recordActivityIncrement(input: {
    guildId?: string | bigint | null;
    roleSegment?: RoleSegment | string | null;
    kind: 'message' | 'voice' | 'reaction';
    amount: number;
  }) {
    if (input.amount === 0) return;
    this.activityIncrements.inc(
      {
        guild_id: normalizeGuildId(input.guildId),
        role_segment: normalizeRoleSegment(input.roleSegment),
        kind: input.kind,
      },
      Math.abs(input.amount),
    );
  }

  recordWalletTransaction(input: {
    guildId?: string | bigint | null;
    type: string;
    reason: string;
    amount: bigint;
  }) {
    const labels = {
      guild_id: normalizeGuildId(input.guildId),
      type: normalizeMetricLabel(input.type),
      reason: normalizeMetricLabel(input.reason),
    };
    const amount = Number(input.amount < 0n ? -input.amount : input.amount);

    this.walletTransactions.inc(labels);
    this.walletCoinVolume.inc(labels, amount);
  }

  recordMahoragaDetection(input: {
    guildId?: string | bigint | null;
    reason: string;
    mode: string;
    status: string;
  }) {
    this.mahoragaDetections.inc({
      guild_id: normalizeGuildId(input.guildId),
      reason: normalizeMetricLabel(input.reason),
      mode: normalizeMetricLabel(input.mode),
      status: normalizeMetricLabel(input.status),
    });
  }

  recordGuildEvent(input: { guildId?: string | bigint | null; event: string }) {
    this.guildEvents.inc({
      guild_id: normalizeGuildId(input.guildId),
      event: normalizeMetricLabel(input.event),
    });
  }
}

function normalizeRouteLabel(route: string): string {
  const cleanRoute = route.split('?')[0] || '/';
  return cleanRoute
    .replaceAll(/\/\d{6,}/g, '/:id')
    .replaceAll(/\/[0-9a-f]{16,}/gi, '/:id')
    .slice(0, 120);
}

function normalizeGuildId(value: string | bigint | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'unknown';
  return String(value);
}
