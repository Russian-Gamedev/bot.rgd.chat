import { describe, expect, it } from 'bun:test';
import { randomInt } from 'node:crypto';

import {
  isValidFinalFrame,
  payoutFor,
  pocketColor,
  ROULETTE_EMOJI,
  ROULETTE_PAYOUTS,
  resolveFinalFrame,
  rollPocket,
  spinFrame,
} from './roulette.utils';

describe('roulette wheel', () => {
  describe('pocketColor', () => {
    it('maps the 37 pockets', () => {
      expect(pocketColor(0)).toBe('green');
      expect(pocketColor(1)).toBe('red');
      expect(pocketColor(18)).toBe('red');
      expect(pocketColor(19)).toBe('black');
      expect(pocketColor(36)).toBe('black');
    });

    it('rolls pockets inside the wheel', () => {
      for (let i = 0; i < 100; i++) {
        const pocket = rollPocket();
        expect(pocket).toBeGreaterThanOrEqual(0);
        expect(pocket).toBeLessThanOrEqual(36);
      }
    });
  });

  describe('payouts', () => {
    it('gives every bet the same house edge of 1/37', () => {
      const edge = (color: keyof typeof ROULETTE_PAYOUTS, pockets: number) =>
        (pockets * Number(ROULETTE_PAYOUTS[color])) / 37;

      expect(edge('red', 18)).toBe(edge('black', 18));
      expect(edge('green', 1)).toBe(edge('red', 18));
      expect(edge('red', 18)).toBeLessThan(1);
    });

    it('multiplies the bet', () => {
      expect(payoutFor('red', 100n)).toBe(200n);
      expect(payoutFor('black', 100n)).toBe(200n);
      expect(payoutFor('green', 100n)).toBe(3600n);
    });
  });

  describe('spinFrame', () => {
    it('renders a 5×5 grid with the arrow in the center', () => {
      const rows = spinFrame(0, 0).split('\n');
      expect(rows).toHaveLength(5);
      for (const row of rows) {
        expect(row.split(' ')).toHaveLength(5);
      }
    });

    it('rotates the ring forward', () => {
      const at = (grid: string, row: number, col: number) =>
        grid.split('\n')[row].split(' ')[col];

      // the top-left corner cell must travel clockwise along the perimeter
      expect(at(spinFrame(0, 0), 0, 0)).toBe(ROULETTE_EMOJI.red);
      expect(at(spinFrame(1, 0), 0, 1)).toBe(ROULETTE_EMOJI.red);
      expect(at(spinFrame(2, 0), 0, 2)).toBe(ROULETTE_EMOJI.red);
    });
  });

  describe('resolveFinalFrame', () => {
    it('always puts the rolled color under the arrow', () => {
      const colors = ['red', 'black', 'green'] as const;
      for (const color of colors) {
        for (let i = 0; i < 50; i++) {
          const prevOffset = randomInt(16);
          const prevArrowIndex = randomInt(8);

          const { ringOffset, arrowIndex } = resolveFinalFrame(
            color,
            prevOffset,
            prevArrowIndex,
          );

          expect(isValidFinalFrame(color, ringOffset, arrowIndex)).toBeTrue();
        }
      }
    });

    it('keeps the wheel rotating forward', () => {
      const prevOffset = 5;
      for (let i = 0; i < 50; i++) {
        const { ringOffset } = resolveFinalFrame('green', prevOffset, 0);
        const steps = (ringOffset - prevOffset + 16) % 16;
        expect(steps).toBeGreaterThanOrEqual(1);
        expect(steps).toBeLessThanOrEqual(16);
      }
    });
  });
});
