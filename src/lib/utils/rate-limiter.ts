export interface FixedWindowRedis {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

/** Increments a Redis fixed-window counter and returns whether it reached the limit. */
export async function hitFixedWindowThreshold(
  redis: FixedWindowRedis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (limit <= 1) return true;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSeconds);
  }

  return count >= limit;
}
