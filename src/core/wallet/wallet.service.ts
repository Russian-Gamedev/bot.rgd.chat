import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Optional } from '@nestjs/common';

import { MetricsService } from '#common/metrics/metrics.service';
import type { DiscordID } from '#root/lib/types';
import { WalletEntity } from './entities/wallet.entity';
import {
  WalletTransactionEntity,
  WalletTransactionType,
} from './entities/wallet-transaction.entity';
import {
  InsufficientFundsException,
  InvalidAmountException,
} from './wallet.exception';

export interface WalletHistoryOptions {
  limit?: number;
  offset?: number;
  type?: WalletTransactionType;
}

export interface WalletOperationOptions {
  guildId?: DiscordID | null;
  metadata?: Record<string, unknown>;
}

export interface WalletTransactionQuery {
  userId?: DiscordID;
  guildId?: DiscordID | null;
  type?: WalletTransactionType;
  reason?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: EntityRepository<WalletEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepository: EntityRepository<WalletTransactionEntity>,
    private readonly em: EntityManager,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async getBalance(userId: DiscordID): Promise<bigint> {
    const wallet = await this.walletRepository.findOne({
      user_id: BigInt(userId),
    });
    return wallet?.coins ?? 0n;
  }

  async getOrCreateWallet(userId: DiscordID): Promise<WalletEntity> {
    const normalizedUserId = BigInt(userId);
    const existing = await this.walletRepository.findOne({
      user_id: normalizedUserId,
    });
    if (existing) return existing;

    const wallet = new WalletEntity();
    wallet.user_id = normalizedUserId;
    wallet.coins = 0n;
    await this.em.persist(wallet).flush();
    return wallet;
  }

  async getTopWallets(limit: number): Promise<WalletEntity[]> {
    return this.walletRepository.find(
      { coins: { $gt: 0n } },
      {
        orderBy: { coins: 'DESC' },
        limit,
      },
    );
  }

  async credit(
    userId: DiscordID,
    amount: bigint,
    reason: string,
    options: WalletOperationOptions = {},
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0n) {
      throw new InvalidAmountException('credit');
    }

    return this.em.transactional(async (em) => {
      const wallet = await this.getOrCreateWalletForUpdate(userId, em);
      wallet.coins += amount;

      const tx = new WalletTransactionEntity();
      tx.user_id = wallet.user_id;
      tx.guild_id = toBigIntOrNull(options.guildId);
      tx.amount = amount;
      tx.balance_after = wallet.coins;
      tx.type = WalletTransactionType.CREDIT;
      tx.reason = reason;
      tx.metadata = options.metadata ?? null;

      em.persist(wallet);
      em.persist(tx);
      await em.flush();

      this.recordTransactionMetric(tx);
      return tx;
    });
  }

  async debit(
    userId: DiscordID,
    amount: bigint,
    reason: string,
    options: WalletOperationOptions = {},
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0n) {
      throw new InvalidAmountException('debit');
    }

    return this.em.transactional(async (em) => {
      const wallet = await this.getOrCreateWalletForUpdate(userId, em);
      if (wallet.coins < amount) {
        throw new InsufficientFundsException(wallet.coins, amount);
      }

      wallet.coins -= amount;

      const tx = new WalletTransactionEntity();
      tx.user_id = wallet.user_id;
      tx.guild_id = toBigIntOrNull(options.guildId);
      tx.amount = amount;
      tx.balance_after = wallet.coins;
      tx.type = WalletTransactionType.DEBIT;
      tx.reason = reason;
      tx.metadata = options.metadata ?? null;

      em.persist(wallet);
      em.persist(tx);
      await em.flush();

      this.recordTransactionMetric(tx);
      return tx;
    });
  }

  async transfer(
    fromUserId: DiscordID,
    toUserId: DiscordID,
    amount: bigint,
    reason = 'transfer',
    options: WalletOperationOptions = {},
  ): Promise<[WalletTransactionEntity, WalletTransactionEntity]> {
    if (amount <= 0n) {
      throw new InvalidAmountException('transfer');
    }

    return this.em.transactional(async (em) => {
      const fromWallet = await this.getOrCreateWalletForUpdate(fromUserId, em);
      if (fromWallet.coins < amount) {
        throw new InsufficientFundsException(fromWallet.coins, amount);
      }

      const toWallet =
        fromUserId === toUserId
          ? fromWallet
          : await this.getOrCreateWalletForUpdate(toUserId, em);

      fromWallet.coins -= amount;
      toWallet.coins += amount;

      const guildId = toBigIntOrNull(options.guildId);

      const debitTx = new WalletTransactionEntity();
      debitTx.user_id = fromWallet.user_id;
      debitTx.guild_id = guildId;
      debitTx.amount = amount;
      debitTx.balance_after = fromWallet.coins;
      debitTx.type = WalletTransactionType.TRANSFER_OUT;
      debitTx.reason = reason;
      debitTx.related_user_id = toWallet.user_id;

      const creditTx = new WalletTransactionEntity();
      creditTx.user_id = toWallet.user_id;
      creditTx.guild_id = guildId;
      creditTx.amount = amount;
      creditTx.balance_after = toWallet.coins;
      creditTx.type = WalletTransactionType.TRANSFER_IN;
      creditTx.reason = reason;
      creditTx.related_user_id = fromWallet.user_id;

      em.persist(fromWallet);
      em.persist(toWallet);
      em.persist(debitTx);
      em.persist(creditTx);
      await em.flush();

      this.recordTransactionMetric(debitTx);
      this.recordTransactionMetric(creditTx);
      return [debitTx, creditTx];
    });
  }

  async getHistory(
    userId: DiscordID,
    guildId?: DiscordID | null,
    options: WalletHistoryOptions = {},
  ): Promise<WalletTransactionEntity[]> {
    const { limit = 50, offset = 0, type } = options;

    const where: Record<string, unknown> = {
      user_id: BigInt(userId),
    };

    if (guildId) {
      where.guild_id = BigInt(guildId);
    }

    if (type) {
      where.type = type;
    }

    return this.txRepository.find(where, {
      orderBy: { createdAt: 'DESC' },
      limit: Math.min(limit, 100),
      offset,
    });
  }

  async findTransactions(
    query: WalletTransactionQuery = {},
  ): Promise<WalletTransactionEntity[]> {
    const {
      userId,
      guildId,
      type,
      reason,
      fromDate,
      toDate,
      limit = 50,
    } = query;

    const where: Record<string, unknown> = {};
    if (userId) where.user_id = BigInt(userId);
    if (guildId) where.guild_id = BigInt(guildId);
    if (type) where.type = type;
    if (reason) where.reason = reason;
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate ? { $gte: fromDate } : {}),
        ...(toDate ? { $lte: toDate } : {}),
      };
    }

    return this.txRepository.find(where, {
      orderBy: { createdAt: 'DESC' },
      limit: Math.min(limit, 100),
    });
  }

  async getCurrentUserBalance(userId: DiscordID): Promise<bigint> {
    return this.getBalance(userId);
  }

  private async getOrCreateWalletForUpdate(
    userId: DiscordID,
    em: EntityManager,
  ): Promise<WalletEntity> {
    const normalizedUserId = BigInt(userId);
    const wallet = await em.findOne(WalletEntity, {
      user_id: normalizedUserId,
    });
    if (wallet) return wallet;

    const created = new WalletEntity();
    created.user_id = normalizedUserId;
    created.coins = 0n;
    em.persist(created);
    return created;
  }

  private recordTransactionMetric(tx: WalletTransactionEntity) {
    this.metrics?.recordWalletTransaction({
      guildId: tx.guild_id,
      type: tx.type,
      reason: tx.reason ?? 'unknown',
      amount: tx.amount,
    });
  }
}

function toBigIntOrNull(value?: DiscordID | null): bigint | null {
  if (value === null || value === undefined) return null;
  return BigInt(value);
}
