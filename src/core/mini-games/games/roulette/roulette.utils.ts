import { randomInt } from 'node:crypto';

import { EmojiSlots } from '#config/emojies';

import type { RouletteColor } from './roulette.types';

/**
 * European-style wheel: 37 pockets — 18 red, 18 black, 1 green.
 * Red/black return 2× the bet, green returns 36×, giving every bet the
 * same house edge: return·probability − 1 = −1/37 ≈ −2.7%.
 */
export const ROULETTE_PAYOUTS: Record<RouletteColor, bigint> = {
  red: 2n,
  black: 2n,
  green: 36n,
};

export const ROULETTE_EMOJI: Record<RouletteColor, string> = {
  red: '🟥',
  black: '⬛',
  green: '🟩',
};

export const ROULETTE_LABELS: Record<RouletteColor, string> = {
  red: 'Красное',
  black: 'Чёрное',
  green: 'Зелёное',
};

/** Rolls a pocket: 0 is green, 1–18 red, 19–36 black. */
export function rollPocket(): number {
  return randomInt(37);
}

export function pocketColor(pocket: number): RouletteColor {
  if (pocket === 0) return 'green';
  return pocket <= 18 ? 'red' : 'black';
}

export function payoutFor(color: RouletteColor, bet: bigint): bigint {
  return ROULETTE_PAYOUTS[color] * bet;
}

/** Settles a color bet: pays out only when the pick matches the roll. */
export function settleBet(
  pick: RouletteColor,
  rolled: RouletteColor,
  bet: bigint,
): { won: boolean; payout: bigint } {
  const won = pick === rolled;
  return { won, payout: won ? payoutFor(rolled, bet) : 0n };
}

/**
 * Wheel rendering: 5×5 emoji grid. The 16-cell outer ring carries the
 * sector colors, the inner ring is void and the center is the arrow.
 */
const VOID = EmojiSlots.Void;

/** Sector colors, clockwise from the top-left corner: 7 red, 8 black, 1 green. */
const RING: string[] = [
  '🟥',
  '⬛',
  '🟥',
  '⬛',
  '🟩',
  '⬛',
  '🟥',
  '⬛',
  '🟥',
  '⬛',
  '🟥',
  '⬛',
  '🟥',
  '⬛',
  '🟥',
  '⬛',
];

/** Perimeter cells, clockwise from the top-left corner. */
const PERIMETER: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 3],
  [4, 2],
  [4, 1],
  [4, 0],
  [3, 0],
  [2, 0],
  [1, 0],
];

/** Arrow emojis in clockwise order; index i points at RAY_POSITIONS[i]. */
const ARROWS = ['➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '⬆️', '↗️'];

/**
 * Perimeter index each arrow points at (corners + side midpoints).
 * These are the even perimeter indices, so a ring offset of one flips
 * the ray cells between the R/G set and the B set — every color is
 * always reachable.
 */
const RAY_POSITIONS = [6, 8, 10, 12, 14, 0, 2, 4];

const RING_LENGTH = RING.length;

/** A cosmetic spinning frame: ring rotated, arrow at the given direction. */
export function spinFrame(ringOffset: number, arrowIndex: number): string {
  const cells: string[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => VOID),
  );
  PERIMETER.forEach(([row, col], position) => {
    cells[row][col] = RING[(position - ringOffset + RING_LENGTH) % RING_LENGTH];
  });
  cells[2][2] = ARROWS[arrowIndex % ARROWS.length];
  return cells.map((row) => row.join(' ')).join('\n');
}

/** Whether the arrow points at a cell of `color` in this frame. */
export function isValidFinalFrame(
  color: RouletteColor,
  ringOffset: number,
  arrowIndex: number,
): boolean {
  const ray = RAY_POSITIONS[arrowIndex % ARROWS.length];
  return (
    RING[(ray - ringOffset + RING_LENGTH) % RING_LENGTH] ===
    ROULETTE_EMOJI[color]
  );
}

/**
 * Resolves the final frame for a rolled color: the arrow keeps moving
 * clockwise from prevArrowIndex and the ring keeps rotating forward
 * from prevOffset until the rolled color is under the arrow.
 */
export function resolveFinalFrame(
  color: RouletteColor,
  prevOffset: number,
  prevArrowIndex: number,
): { grid: string; ringOffset: number; arrowIndex: number } {
  const arrowIndex = (prevArrowIndex + randomInt(1, 9)) % ARROWS.length;

  let ringOffset = prevOffset;
  let steps = 0;
  while (!isValidFinalFrame(color, ringOffset, arrowIndex)) {
    ringOffset = (ringOffset + 1) % RING_LENGTH;
    if (++steps > RING_LENGTH) {
      throw new Error(`No wheel frame puts ${color} under the arrow`);
    }
  }

  return { grid: spinFrame(ringOffset, arrowIndex), ringOffset, arrowIndex };
}
