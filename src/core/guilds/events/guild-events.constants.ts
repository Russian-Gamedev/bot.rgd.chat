export const GUILD_EVENT_COST = 10_000n;

/**
 * Smoothing for the pick weight 1 / (triggered_count + N):
 * higher values pull the distribution closer to uniform random.
 */
export const GUILD_EVENT_PICK_SMOOTHING = 10;
