import type Redis from 'ioredis';
import { hitFixedWindowThreshold } from '#lib/utils';

import {
  SUMMARY_RATE_LIMIT,
  SUMMARY_RATE_WINDOW_SECONDS,
} from './summarize.constants';

export function summarizeRateLimitKey(guildId: string, userId: string): string {
  return `summarize:limit:${guildId}:${userId}`;
}

export async function isSummarizeRateLimited(
  redis: Redis,
  guildId: string,
  userId: string,
  isAdmin = false,
): Promise<boolean> {
  if (isAdmin) return false;

  // The helper returns true on reaching the limit, so +1 allows exactly
  // SUMMARY_RATE_LIMIT calls.
  return hitFixedWindowThreshold(
    redis,
    summarizeRateLimitKey(guildId, userId),
    SUMMARY_RATE_LIMIT + 1,
    SUMMARY_RATE_WINDOW_SECONDS,
  );
}
