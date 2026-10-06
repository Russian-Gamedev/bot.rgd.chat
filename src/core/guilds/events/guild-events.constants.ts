import { GuildEvents } from '#config/guilds';

export const GUILD_EVENT_COST = 10_000n;

/** Pool size override per event type; falls back to GUILD_EVENT_DEFAULT_POOL_SIZE. */
export const GUILD_EVENT_POOL_SIZE: Partial<Record<GuildEvents, number>> = {
  [GuildEvents.MEMBER_FIRST_JOIN]: 3,
  [GuildEvents.MEMBER_BAN]: 2,
  [GuildEvents.MEMBER_KICK]: 2,
};

export const GUILD_EVENT_DEFAULT_POOL_SIZE = 10;
