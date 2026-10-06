import { raw } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { WalletService } from '#core/wallet/wallet.service';
import type { DiscordID } from '#root/lib/types';

import {
  MiniGame,
  MiniGameRoundEntity,
} from './entities/mini-game-round.entity';
import { MiniGameAlreadyPlayingException } from './mini-game.exception';
import type {
  MiniGameOutcome,
  MiniGamePlayParams,
  MiniGameResult,
  MiniGameRoundContext,
  MiniGameStatsFilter,
  MiniGameStatsRow,
} from './mini-game.types';

interface StatsRawRow {
  game: string;
  rounds: string;
  wins: string;
  total_bet: string;
  total_payout: string;
  biggest_win: string;
}

@Injectable()
export class MiniGameService {
  private readonly logger = new Logger(MiniGameService.name);
  private readonly locks = new Set<string>();

  constructor(
    private readonly walletService: WalletService,
    @InjectRepository(MiniGameRoundEntity)
    private readonly roundRepository: EntityRepository<MiniGameRoundEntity>,
    private readonly em: EntityManager,
  ) {}

  /**
   * Runs a full game round: locks the player, debits the bet up front,
   * executes the game body, credits the payout back and records stats.
   * The lock is always released; a failed game body refunds the bet.
   */
  async play(
    params: MiniGamePlayParams,
    round: (ctx: MiniGameRoundContext) => Promise<MiniGameOutcome>,
  ): Promise<MiniGameResult> {
    const lockKey = `${params.game}:${params.userId}`;
    if (this.isPlaying(params.game, params.userId)) {
      throw new MiniGameAlreadyPlayingException(params.game);
    }
    this.locks.add(lockKey);

    try {
      const reason = `mini-game:${params.game}`;
      const betTx = await this.walletService.debit(
        params.userId,
        params.bet,
        reason,
        { guildId: params.guildId },
      );

      let outcome: MiniGameOutcome;
      try {
        outcome = await round({ balance: betTx.balance_after });
      } catch (error) {
        await this.walletService.credit(
          params.userId,
          params.bet,
          `${reason}:refund`,
          { guildId: params.guildId },
        );
        throw error;
      }

      let balanceAfter = betTx.balance_after;
      if (outcome.payout > 0n) {
        const payoutTx = await this.walletService.credit(
          params.userId,
          outcome.payout,
          reason,
          { guildId: params.guildId },
        );
        balanceAfter = payoutTx.balance_after;
      }

      // stats are best-effort: a failed insert must not fail a paid-out round
      try {
        await this.recordRound(params, outcome);
      } catch (error) {
        this.logger.error('Failed to record mini game round', error);
      }

      return {
        game: params.game,
        bet: params.bet,
        payout: outcome.payout,
        net: outcome.payout - params.bet,
        balanceBefore: betTx.balance_after + params.bet,
        balanceAfter,
        won: outcome.payout > 0n,
      };
    } finally {
      this.locks.delete(lockKey);
    }
  }

  /** Whether the player currently has a locked round of this game. */
  isPlaying(game: MiniGame, userId: DiscordID): boolean {
    return this.locks.has(`${game}:${userId}`);
  }

  /** Per-game aggregated stats, one row per game present in the filter scope. */
  async getStatsBreakdown(
    filter: MiniGameStatsFilter,
  ): Promise<MiniGameStatsRow[]> {
    const rows = await this.em
      .createQueryBuilder(MiniGameRoundEntity)
      .select([
        'game',
        raw('count(*)').as('rounds'),
        raw('count(*) filter (where payout > 0)').as('wins'),
        raw('coalesce(sum(bet), 0)').as('total_bet'),
        raw('coalesce(sum(payout), 0)').as('total_payout'),
        raw('coalesce(max(payout), 0)').as('biggest_win'),
      ])
      .where(this.buildWhere(filter))
      .groupBy('game')
      .execute<StatsRawRow[]>('all');

    return rows.map((row) => {
      const totalBet = BigInt(row.total_bet);
      const totalPayout = BigInt(row.total_payout);
      return {
        game: row.game as MiniGame,
        rounds: Number(row.rounds),
        wins: Number(row.wins),
        totalBet,
        totalPayout,
        biggestWin: BigInt(row.biggest_win),
        net: totalPayout - totalBet,
      };
    });
  }

  /** The single round with the highest payout in the filter scope. */
  async getBiggestRound(
    filter: MiniGameStatsFilter,
  ): Promise<MiniGameRoundEntity | null> {
    return this.roundRepository.findOne(this.buildWhere(filter), {
      orderBy: { payout: 'desc' },
    });
  }

  private async recordRound(
    params: MiniGamePlayParams,
    outcome: MiniGameOutcome,
  ): Promise<void> {
    const round = new MiniGameRoundEntity();
    round.game = params.game;
    round.guild_id = BigInt(params.guildId);
    round.user_id = BigInt(params.userId);
    round.bet = params.bet;
    round.payout = outcome.payout;
    round.details = outcome.details ?? null;
    this.em.persist(round);
    await this.em.flush();
  }

  private buildWhere(filter: MiniGameStatsFilter) {
    const where: { guild_id: bigint; user_id?: bigint; game?: MiniGame } = {
      guild_id: BigInt(filter.guildId),
    };
    if (filter.userId) {
      where.user_id = BigInt(filter.userId);
    }
    if (filter.game) {
      where.game = filter.game;
    }
    return where;
  }
}
