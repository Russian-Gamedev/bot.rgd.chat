import { MiniGame } from './entities/mini-game-round.entity';

/** Bet limits for all mini games, enforced by slash command options. */
export const MIN_BET = 1;
export const MAX_BET = 100_000;

export const MINI_GAME_META: Record<
  MiniGame,
  { label: string; emoji: string }
> = {
  [MiniGame.FLIP]: { label: 'Монетка', emoji: '🪙' },
  [MiniGame.SLOT]: { label: 'Слот-машина', emoji: '🎰' },
  [MiniGame.ROULETTE]: { label: 'Рулетка', emoji: '🎡' },
};
