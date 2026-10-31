import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';

import { MetricsService } from '#common/metrics/metrics.service';
import { formatError } from '#lib/utils';
import type { DiscordID } from '#root/lib/types';

const PATRON_API = 'https://thanks.rgd.chat/api/supporters';
const PATRON_CACHE_KEY = 'users:patron-supporters';
const PATRON_CACHE_TTL_SECONDS = 24 * 60 * 60;
const PATRON_FETCH_TIMEOUT_MS = 10_000;
const PATRON_FETCH_ATTEMPTS = 2;
const PATRON_RETRY_DELAY_MS = 1_000;
const PATRON_TAG_COLOR = '#5C87E7';
const PATRON_TAG_BACKGROUND = '#FEFEFE';
const PATRON_TAG_DESCRIPTION = 'Донат';

interface SupporterDto {
  user: {
    id: string;
  };
  value: number;
}

export interface PatronTag {
  name: string;
  color: string;
  background: string;
  description: string;
}

@Injectable()
export class PatronTagService {
  private readonly logger = new Logger(PatronTagService.name);
  private refreshPromise: Promise<void> | null = null;

  constructor(
    private readonly redis: Redis,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  onApplicationBootstrap() {
    void this.refresh();
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'patron-tag-refresh' })
  async refresh(): Promise<void> {
    this.refreshPromise ??= this.refreshInternal().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  async getTag(userId: DiscordID): Promise<PatronTag | null> {
    const rawValue = await this.redis.hget(PATRON_CACHE_KEY, userId.toString());
    if (rawValue === null) return null;

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) return null;

    return {
      name: formatDonation(value),
      color: PATRON_TAG_COLOR,
      background: PATRON_TAG_BACKGROUND,
      description: PATRON_TAG_DESCRIPTION,
    };
  }

  private async refreshInternal(): Promise<void> {
    const startedAt = performance.now();

    try {
      const supporters = await this.fetchSupporters();
      const amounts = toAmountsByUserId(supporters);

      const transaction = this.redis.multi();
      transaction.del(PATRON_CACHE_KEY);
      if (amounts.size > 0) {
        transaction.hset(PATRON_CACHE_KEY, Object.fromEntries(amounts));
        transaction.expire(PATRON_CACHE_KEY, PATRON_CACHE_TTL_SECONDS);
      }
      await transaction.exec();

      this.metrics?.setPatronSupporters(amounts.size);
      this.metrics?.recordScheduledJob(
        'patron_supporters',
        'success',
        (performance.now() - startedAt) / 1000,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to refresh patron supporters: ${formatError(error)}`,
      );
      this.metrics?.recordScheduledJob(
        'patron_supporters',
        'error',
        (performance.now() - startedAt) / 1000,
      );
    }
  }

  private async fetchSupporters(): Promise<SupporterDto[]> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= PATRON_FETCH_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(PATRON_API, {
          signal: AbortSignal.timeout(PATRON_FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        lastError = error;
        if (attempt < PATRON_FETCH_ATTEMPTS) {
          await Bun.sleep(PATRON_RETRY_DELAY_MS);
        }
        continue;
      }

      if (!response.ok) {
        throw new Error(`Patron API responded with ${response.status}`);
      }

      return (await response.json()) as SupporterDto[];
    }

    throw lastError ?? new Error('Patron API request failed');
  }
}

function toAmountsByUserId(supporters: SupporterDto[]): Map<string, number> {
  const amounts = new Map<string, number>();

  for (const supporter of supporters) {
    const value = Number(supporter.value);
    if (!supporter.user?.id || !Number.isFinite(value) || value <= 0) {
      continue;
    }

    amounts.set(supporter.user.id, value);
  }

  return amounts;
}

function formatDonation(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
