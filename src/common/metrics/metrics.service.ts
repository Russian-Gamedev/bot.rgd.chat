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

  private readonly appStartups = new Counter({
    name: 'rgd_bot_app_startup_total',
    help: 'Application startups by classified reason.',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  private readonly appStartupReason = new Gauge({
    name: 'rgd_bot_app_startup_reason',
    help: 'Classified reason of the current application startup.',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  private readonly appStartupTimestamp = new Gauge({
    name: 'rgd_bot_app_startup_timestamp_seconds',
    help: 'Unix timestamp of the current application startup.',
    registers: [this.registry],
  });

  private readonly appRestartCount = new Gauge({
    name: 'rgd_bot_app_restart_count',
    help: 'Consecutive restarts for the current commit.',
    registers: [this.registry],
  });

  private readonly buildInfo = new Gauge({
    name: 'rgd_bot_build_info',
    help: 'Build information for the running application.',
    labelNames: ['branch', 'commit'] as const,
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

  private readonly scheduledJobLastSuccess = new Gauge({
    name: 'rgd_bot_scheduled_job_last_success_timestamp_seconds',
    help: 'Unix timestamp of the last successful scheduled job run.',
    labelNames: ['task'] as const,
    registers: [this.registry],
  });

  private readonly profileCacheLookups = new Counter({
    name: 'rgd_bot_profile_cache_lookups_total',
    help: 'Public profile cache lookups by result.',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  private readonly profileLookupsNotFound = new Counter({
    name: 'rgd_bot_profile_lookup_not_found_total',
    help: 'Public profile lookups that found no user, by lookup kind.',
    labelNames: ['lookup_kind'] as const,
    registers: [this.registry],
  });

  private readonly profileSyncs = new Counter({
    name: 'rgd_bot_profile_sync_total',
    help: 'Public profile Discord syncs by result.',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  private readonly profileSyncDuration = new Histogram({
    name: 'rgd_bot_profile_sync_duration_seconds',
    help: 'Public profile Discord sync duration in seconds.',
    labelNames: ['result'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  private readonly patronSupporters = new Gauge({
    name: 'rgd_bot_patron_supporters',
    help: 'Patrons returned by the supporter API.',
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
    labelNames: [
      'command',
      'guild_id',
      'guild_name',
      'role_segment',
      'status',
    ] as const,
    registers: [this.registry],
  });

  private readonly activityIncrements = new Counter({
    name: 'rgd_bot_activity_increment_total',
    help: 'Activity increments recorded by kind.',
    labelNames: ['guild_id', 'guild_name', 'role_segment', 'kind'] as const,
    registers: [this.registry],
  });

  private readonly walletTransactions = new Counter({
    name: 'rgd_bot_wallet_transactions_total',
    help: 'Wallet transactions by type and reason.',
    labelNames: ['guild_id', 'guild_name', 'type', 'reason'] as const,
    registers: [this.registry],
  });

  private readonly walletCoinVolume = new Counter({
    name: 'rgd_bot_wallet_coin_volume_total',
    help: 'Wallet coin volume by type and reason.',
    labelNames: ['guild_id', 'guild_name', 'type', 'reason'] as const,
    registers: [this.registry],
  });

  private readonly mahoragaDetections = new Counter({
    name: 'rgd_bot_mahoraga_detections_total',
    help: 'Mahoraga detections and actions.',
    labelNames: ['guild_id', 'guild_name', 'reason', 'mode', 'status'] as const,
    registers: [this.registry],
  });

  private readonly guildEvents = new Counter({
    name: 'rgd_bot_guild_events_total',
    help: 'Guild member and invite events.',
    labelNames: ['guild_id', 'guild_name', 'event'] as const,
    registers: [this.registry],
  });

  private readonly guildNames = new Map<string, string>();

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

  recordAppStartup(reason: string) {
    const normalizedReason = normalizeMetricLabel(reason);
    this.appStartups.inc({ reason: normalizedReason });
    this.appStartupReason.reset();
    this.appStartupReason.set({ reason: normalizedReason }, 1);
    this.appStartupTimestamp.set(Date.now() / 1000);
  }

  setAppRestartCount(count: number) {
    this.appRestartCount.set(count);
  }

  setBuildInfo(branch: string, commit: string) {
    this.buildInfo.set(
      {
        branch: normalizeMetricLabel(branch),
        commit: normalizeMetricLabel(commit),
      },
      1,
    );
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

  registerGuild(
    guildId: string | bigint | null | undefined,
    guildName: string,
  ) {
    const id = normalizeGuildId(guildId);
    const name = normalizeMetricLabel(guildName);
    if (id !== 'unknown' && name && name !== 'unknown') {
      this.guildNames.set(id, name);
    }
  }

  registerGuilds(guilds: Iterable<{ id: string; name: string }>) {
    for (const guild of guilds) {
      this.registerGuild(guild.id, guild.name);
    }
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
    if (status === 'success') {
      this.scheduledJobLastSuccess.set(
        { task: normalizeMetricLabel(job) },
        Date.now() / 1000,
      );
    }
  }

  recordProfileCacheLookup(result: 'hit' | 'miss' | 'miss_marker') {
    this.profileCacheLookups.inc({ result });
  }

  recordProfileLookupNotFound(kind: 'id' | 'username') {
    this.profileLookupsNotFound.inc({ lookup_kind: kind });
  }

  recordProfileSync(
    result: 'fresh' | 'none' | 'error',
    durationSeconds: number,
  ) {
    this.profileSyncs.inc({ result });
    this.profileSyncDuration.observe({ result }, durationSeconds);
  }

  setPatronSupporters(count: number) {
    this.patronSupporters.set(count);
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
      ...this.guildLabels(input.guildId),
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
        ...this.guildLabels(input.guildId),
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
      ...this.guildLabels(input.guildId),
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
      ...this.guildLabels(input.guildId),
      reason: normalizeMetricLabel(input.reason),
      mode: normalizeMetricLabel(input.mode),
      status: normalizeMetricLabel(input.status),
    });
  }

  recordGuildEvent(input: { guildId?: string | bigint | null; event: string }) {
    this.guildEvents.inc({
      ...this.guildLabels(input.guildId),
      event: normalizeMetricLabel(input.event),
    });
  }

  private guildLabels(value: string | bigint | null | undefined) {
    const guild_id = normalizeGuildId(value);
    const guild_name = this.guildNames.get(guild_id) ?? guild_id;
    return { guild_id, guild_name };
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
