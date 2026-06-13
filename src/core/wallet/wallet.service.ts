import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { DiscordID } from '#root/lib/types';
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

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: EntityRepository<WalletEntity>,
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepository: EntityRepository<WalletTransactionEntity>,
    private readonly em: EntityManager,
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
    user: MemberProfileEntity,
    amount: bigint,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0n) {
      throw new InvalidAmountException('credit');
    }

    return this.em.transactional(async (em) => {
      const wallet = await this.getOrCreateWalletForUpdate(user.user_id, em);
      wallet.coins += amount;

      const tx = new WalletTransactionEntity();
      tx.user_id = user.user_id;
      tx.guild_id = user.guild_id;
      tx.amount = amount;
      tx.balance_after = wallet.coins;
      tx.type = WalletTransactionType.CREDIT;
      tx.reason = reason;
      tx.metadata = metadata ?? null;

      em.persist(wallet);
      em.persist(tx);
      await em.flush();

      return tx;
    });
  }

  async debit(
    user: MemberProfileEntity,
    amount: bigint,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0n) {
      throw new InvalidAmountException('debit');
    }

    return this.em.transactional(async (em) => {
      const wallet = await this.getOrCreateWalletForUpdate(user.user_id, em);
      if (wallet.coins < amount) {
        throw new InsufficientFundsException(wallet.coins, amount);
      }

      wallet.coins -= amount;

      const tx = new WalletTransactionEntity();
      tx.user_id = user.user_id;
      tx.guild_id = user.guild_id;
      tx.amount = amount;
      tx.balance_after = wallet.coins;
      tx.type = WalletTransactionType.DEBIT;
      tx.reason = reason;
      tx.metadata = metadata ?? null;

      em.persist(wallet);
      em.persist(tx);
      await em.flush();

      return tx;
    });
  }

  async transfer(
    from: MemberProfileEntity,
    to: MemberProfileEntity,
    amount: bigint,
    reason = 'transfer',
  ): Promise<[WalletTransactionEntity, WalletTransactionEntity]> {
    if (amount <= 0n) {
      throw new InvalidAmountException('transfer');
    }

    return this.em.transactional(async (em) => {
      const fromWallet = await this.getOrCreateWalletForUpdate(
        from.user_id,
        em,
      );
      if (fromWallet.coins < amount) {
        throw new InsufficientFundsException(fromWallet.coins, amount);
      }

      const toWallet =
        from.user_id === to.user_id
          ? fromWallet
          : await this.getOrCreateWalletForUpdate(to.user_id, em);

      fromWallet.coins -= amount;
      toWallet.coins += amount;

      const debitTx = new WalletTransactionEntity();
      debitTx.user_id = from.user_id;
      debitTx.guild_id = from.guild_id;
      debitTx.amount = amount;
      debitTx.balance_after = fromWallet.coins;
      debitTx.type = WalletTransactionType.TRANSFER_OUT;
      debitTx.reason = reason;
      debitTx.related_user_id = to.user_id;

      const creditTx = new WalletTransactionEntity();
      creditTx.user_id = to.user_id;
      creditTx.guild_id = to.guild_id;
      creditTx.amount = amount;
      creditTx.balance_after = toWallet.coins;
      creditTx.type = WalletTransactionType.TRANSFER_IN;
      creditTx.reason = reason;
      creditTx.related_user_id = from.user_id;

      em.persist(fromWallet);
      em.persist(toWallet);
      em.persist(debitTx);
      em.persist(creditTx);
      await em.flush();

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
}
