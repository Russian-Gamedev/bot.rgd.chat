import type { DiscordID } from '#root/lib/types';

import type { MiniGame } from './entities/mini-game-round.entity';

export interface MiniGamePlayParams {
  game: MiniGame;
  guildId: DiscordID;
  userId: DiscordID;
  bet: bigint;
}

export interface MiniGameRoundContext {
  /** Player balance right after the bet was placed. */
  balance: bigint;
}

export interface MiniGameOutcome {
  /** Total coins credited back to the player, 0n means a loss. */
  payout: bigint;
  details?: Record<string, unknown>;
}

export interface MiniGameResult {
  game: MiniGame;
  bet: bigint;
  payout: bigint;
  net: bigint;
  balanceBefore: bigint;
  balanceAfter: bigint;
  won: boolean;
}

export interface MiniGameStatsFilter {
  guildId: DiscordID;
  userId?: DiscordID;
  game?: MiniGame;
}

export interface MiniGameStatsRow {
  game: MiniGame;
  rounds: number;
  wins: number;
  totalBet: bigint;
  totalPayout: bigint;
  biggestWin: bigint;
  /** Player perspective: totalPayout - totalBet. */
  net: bigint;
}
