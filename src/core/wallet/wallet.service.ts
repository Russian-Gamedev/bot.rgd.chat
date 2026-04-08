import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { UserEntity } from '#core/users/entities/user.entity';
import { DiscordID } from '#root/lib/types';

import {
  WalletTransactionEntity,
  WalletTransactionType,
} from './entities/wallet-transaction.entity';
import { InsufficientFundsException } from './wallet.exception';

export interface WalletHistoryOptions {
  limit?: number;
  offset?: number;
  type?: WalletTransactionType;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletTransactionEntity)
    private readonly txRepository: EntityRepository<WalletTransactionEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: EntityRepository<UserEntity>,
    private readonly em: EntityManager,
  ) {}

  async getBalance(userId: DiscordID, guildId: DiscordID): Promise<bigint> {
    const user = await this.userRepository.findOne({
      user_id: BigInt(userId),
      guild_id: BigInt(guildId),
    });
    return user?.coins ?? 0n;
  }

  async credit(
    user: UserEntity,
    amount: bigint,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0n) {
      throw new Error('Credit amount must be positive');
    }

    return this.em.transactional(async (em) => {
      user.coins += amount;

      const tx = new WalletTransactionEntity();
      tx.user_id = user.user_id;
      tx.guild_id = user.guild_id;
      tx.amount = amount;
      tx.balance_after = user.coins;
      tx.type = WalletTransactionType.CREDIT;
      tx.reason = reason;
      tx.metadata = metadata ?? null;

      em.persist(user);
      em.persist(tx);
      await em.flush();

      return tx;
    });
  }

  async debit(
    user: UserEntity,
    amount: bigint,
    reason: string,
    metadata?: Record<string, unknown>,
  ): Promise<WalletTransactionEntity> {
    if (amount <= 0n) {
      throw new Error('Debit amount must be positive');
    }

    if (user.coins < amount) {
      throw new InsufficientFundsException(user.coins, amount);
    }

    return this.em.transactional(async (em) => {
      user.coins -= amount;

      const tx = new WalletTransactionEntity();
      tx.user_id = user.user_id;
      tx.guild_id = user.guild_id;
      tx.amount = amount;
      tx.balance_after = user.coins;
      tx.type = WalletTransactionType.DEBIT;
      tx.reason = reason;
      tx.metadata = metadata ?? null;

      em.persist(user);
      em.persist(tx);
      await em.flush();

      return tx;
    });
  }

  async transfer(
    from: UserEntity,
    to: UserEntity,
    amount: bigint,
    reason = 'transfer',
  ): Promise<[WalletTransactionEntity, WalletTransactionEntity]> {
    if (amount <= 0n) {
      throw new Error('Transfer amount must be positive');
    }

    if (from.coins < amount) {
      throw new InsufficientFundsException(from.coins, amount);
    }

    return this.em.transactional(async (em) => {
      from.coins -= amount;
      to.coins += amount;

      const debitTx = new WalletTransactionEntity();
      debitTx.user_id = from.user_id;
      debitTx.guild_id = from.guild_id;
      debitTx.amount = amount;
      debitTx.balance_after = from.coins;
      debitTx.type = WalletTransactionType.TRANSFER_OUT;
      debitTx.reason = reason;
      debitTx.related_user_id = to.user_id;

      const creditTx = new WalletTransactionEntity();
      creditTx.user_id = to.user_id;
      creditTx.guild_id = to.guild_id;
      creditTx.amount = amount;
      creditTx.balance_after = to.coins;
      creditTx.type = WalletTransactionType.TRANSFER_IN;
      creditTx.reason = reason;
      creditTx.related_user_id = from.user_id;

      em.persist(from);
      em.persist(to);
      em.persist(debitTx);
      em.persist(creditTx);
      await em.flush();

      return [debitTx, creditTx];
    });
  }

  async getHistory(
    userId: DiscordID,
    guildId: DiscordID,
    options: WalletHistoryOptions = {},
  ): Promise<WalletTransactionEntity[]> {
    const { limit = 50, offset = 0, type } = options;

    const where: Record<string, unknown> = {
      user_id: BigInt(userId),
      guild_id: BigInt(guildId),
    };

    if (type) {
      where.type = type;
    }

    return this.txRepository.find(where, {
      orderBy: { createdAt: 'DESC' },
      limit: Math.min(limit, 100),
      offset,
    });
  }
}
