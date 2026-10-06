import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

import type { WalletTransactionEntity } from '#core/wallet/entities/wallet-transaction.entity';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import {
  MiniGame,
  MiniGameRoundEntity,
} from './entities/mini-game-round.entity';
import { MiniGameAlreadyPlayingException } from './mini-game.exception';
import { MiniGameService } from './mini-game.service';

const PARAMS = {
  game: MiniGame.FLIP,
  guildId: '987654321',
  userId: '123456789',
  bet: 100n,
} as const;

function createTx(balanceAfter: bigint): WalletTransactionEntity {
  return { balance_after: balanceAfter } as WalletTransactionEntity;
}

describe('MiniGameService', () => {
  let service: MiniGameService;
  let mockEm: EntityManager;
  let mockRoundRepo: EntityRepository<MiniGameRoundEntity>;
  let walletDebit: ReturnType<typeof mock>;
  let walletCredit: ReturnType<typeof mock>;

  beforeEach(() => {
    mockEm = {
      persist: mock(() => mockEm),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;

    mockRoundRepo = {
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<MiniGameRoundEntity>;

    walletDebit = mock(() => Promise.resolve(createTx(900n)));
    walletCredit = mock(() => Promise.resolve(createTx(1100n)));

    service = new MiniGameService(
      { debit: walletDebit, credit: walletCredit } as never,
      mockRoundRepo,
      mockEm,
    );
  });

  describe('play', () => {
    it('debits the bet up front and records a lost round', async () => {
      const result = await service.play(PARAMS, async () => ({
        payout: 0n,
      }));

      expect(walletDebit).toHaveBeenCalledWith(
        PARAMS.userId,
        PARAMS.bet,
        'mini-game:flip',
        { guildId: PARAMS.guildId },
      );
      expect(walletCredit).not.toHaveBeenCalled();
      expect(mockEm.persist).toHaveBeenCalled();

      const round = (mockEm.persist as ReturnType<typeof mock>).mock
        .calls[0][0] as MiniGameRoundEntity;
      expect(round).toBeInstanceOf(MiniGameRoundEntity);
      expect(round.game).toBe(MiniGame.FLIP);
      expect(round.guild_id).toBe(987654321n);
      expect(round.user_id).toBe(123456789n);
      expect(round.bet).toBe(100n);
      expect(round.payout).toBe(0n);

      expect(result.won).toBe(false);
      expect(result.net).toBe(-100n);
      expect(result.balanceBefore).toBe(1000n);
      expect(result.balanceAfter).toBe(900n);
    });

    it('credits the payout on win', async () => {
      const result = await service.play(PARAMS, async () => ({
        payout: 200n,
        details: { multiplier: 2 },
      }));

      expect(walletCredit).toHaveBeenCalledWith(
        PARAMS.userId,
        200n,
        'mini-game:flip',
        { guildId: PARAMS.guildId },
      );

      const round = (mockEm.persist as ReturnType<typeof mock>).mock
        .calls[0][0] as MiniGameRoundEntity;
      expect(round.payout).toBe(200n);
      expect(round.details).toEqual({ multiplier: 2 });

      expect(result.won).toBe(true);
      expect(result.balanceAfter).toBe(1100n);
    });

    it('rejects a second concurrent round and releases the lock after it ends', async () => {
      let releaseRound!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseRound = resolve;
      });

      const first = service.play(PARAMS, async () => {
        await gate;
        return { payout: 0n };
      });

      expect(service.isPlaying(MiniGame.FLIP, PARAMS.userId)).toBe(true);

      let err: unknown;
      try {
        await service.play(PARAMS, async () => ({ payout: 0n }));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(MiniGameAlreadyPlayingException);

      releaseRound();
      await first;

      expect(service.isPlaying(MiniGame.FLIP, PARAMS.userId)).toBe(false);

      // the rejected round never reached the debit
      await service.play(PARAMS, async () => ({ payout: 0n }));
      expect(walletDebit).toHaveBeenCalledTimes(2);
    });

    it('propagates insufficient funds and releases the lock', async () => {
      walletDebit.mockRejectedValueOnce(
        new InsufficientFundsException(50n, PARAMS.bet),
      );

      let err: unknown;
      try {
        await service.play(PARAMS, async () => ({ payout: 0n }));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(InsufficientFundsException);

      await service.play(PARAMS, async () => ({ payout: 0n }));
      expect(walletDebit).toHaveBeenCalledTimes(2);
    });

    it('refunds the bet when the game body fails', async () => {
      let err: unknown;
      try {
        await service.play(PARAMS, async () => {
          throw new Error('discord api exploded');
        });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(Error);
      expect(walletCredit).toHaveBeenCalledWith(
        PARAMS.userId,
        PARAMS.bet,
        'mini-game:flip:refund',
        { guildId: PARAMS.guildId },
      );
      expect(mockEm.persist).not.toHaveBeenCalled();
    });
  });

  describe('getStatsBreakdown', () => {
    it('maps raw aggregate rows', async () => {
      const qb = {
        select: mock(() => qb),
        where: mock(() => qb),
        groupBy: mock(() => qb),
        execute: mock(() =>
          Promise.resolve([
            {
              game: 'slot',
              rounds: '2',
              wins: '1',
              total_bet: '300',
              total_payout: '150',
              biggest_win: '150',
            },
          ]),
        ),
      };
      (mockEm.createQueryBuilder as ReturnType<typeof mock>) = mock(() => qb);

      const rows = await service.getStatsBreakdown({
        guildId: '987654321',
        game: MiniGame.SLOT,
      });

      expect(qb.where).toHaveBeenCalledWith({
        guild_id: 987654321n,
        game: MiniGame.SLOT,
      });
      expect(rows).toEqual([
        {
          game: MiniGame.SLOT,
          rounds: 2,
          wins: 1,
          totalBet: 300n,
          totalPayout: 150n,
          biggestWin: 150n,
          net: -150n,
        },
      ]);
    });
  });

  describe('getBiggestRound', () => {
    it('queries the round with the highest payout', async () => {
      const round = new MiniGameRoundEntity();
      (mockRoundRepo.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        round,
      );

      const result = await service.getBiggestRound({
        guildId: '987654321',
        userId: '123456789',
      });

      expect(mockRoundRepo.findOne).toHaveBeenCalledWith(
        { guild_id: 987654321n, user_id: 123456789n },
        { orderBy: { payout: 'desc' } },
      );
      expect(result).toBe(round);
    });
  });
});
