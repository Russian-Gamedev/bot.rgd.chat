import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { UserEntity } from '#core/users/entities/user.entity';

import {
  WalletTransactionEntity,
  WalletTransactionType,
} from './entities/wallet-transaction.entity';
import { InsufficientFundsException } from './wallet.exception';
import { WalletService } from './wallet.service';

function createMockUser(overrides: Partial<UserEntity> = {}): UserEntity {
  const user = new UserEntity();
  user.id = 1;
  user.user_id = 123456789n;
  user.guild_id = 987654321n;
  user.coins = 1000n;
  user.username = 'testuser';
  user.avatar = 'avatar.png';
  Object.assign(user, overrides);
  return user;
}

describe('WalletService', () => {
  let service: WalletService;
  let mockEm: EntityManager;
  let mockTxRepo: EntityRepository<WalletTransactionEntity>;
  let mockUserRepo: EntityRepository<UserEntity>;

  beforeEach(() => {
    mockTxRepo = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<WalletTransactionEntity>;

    mockUserRepo = {
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<UserEntity>;

    mockEm = {
      persist: mock(() => mockEm),
      flush: mock(() => Promise.resolve()),
      transactional: mock(
        async (cb: (em: EntityManager) => Promise<unknown>) => {
          const innerEm = {
            persist: mock(() => innerEm),
            flush: mock(() => Promise.resolve()),
          } as unknown as EntityManager;
          return cb(innerEm);
        },
      ),
    } as unknown as EntityManager;

    service = new WalletService(mockTxRepo, mockUserRepo, mockEm);
  });

  describe('getBalance', () => {
    it('returns 0n when user not found', async () => {
      const balance = await service.getBalance('111', '222');
      expect(balance).toBe(0n);
    });

    it('returns user coins when user exists', async () => {
      const user = createMockUser({ coins: 5000n });
      (mockUserRepo.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        user,
      );

      const balance = await service.getBalance('123456789', '987654321');
      expect(balance).toBe(5000n);
    });
  });

  describe('credit', () => {
    it('adds coins to user and creates transaction', async () => {
      const user = createMockUser({ coins: 1000n });

      const tx = await service.credit(user, 500n, 'test-credit');

      expect(user.coins).toBe(1500n);
      expect(tx).toBeInstanceOf(WalletTransactionEntity);
      expect(tx.amount).toBe(500n);
      expect(tx.balance_after).toBe(1500n);
      expect(tx.type).toBe(WalletTransactionType.CREDIT);
      expect(tx.reason).toBe('test-credit');
      expect(tx.user_id).toBe(user.user_id);
      expect(tx.guild_id).toBe(user.guild_id);
    });

    it('throws on non-positive amount', async () => {
      const user = createMockUser();

      expect(service.credit(user, 0n, 'bad')).rejects.toThrow(
        'Credit amount must be positive',
      );
      expect(service.credit(user, -5n, 'bad')).rejects.toThrow(
        'Credit amount must be positive',
      );
    });

    it('stores metadata when provided', async () => {
      const user = createMockUser({ coins: 100n });
      const meta = { game: 'flip', bet: 50 };

      const tx = await service.credit(user, 50n, 'mini-game:flip', meta);

      expect(tx.metadata).toEqual(meta);
    });

    it('uses em.transactional for atomicity', async () => {
      const user = createMockUser();

      await service.credit(user, 100n, 'test');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    });
  });

  describe('debit', () => {
    it('subtracts coins from user and creates transaction', async () => {
      const user = createMockUser({ coins: 1000n });

      const tx = await service.debit(user, 300n, 'test-debit');

      expect(user.coins).toBe(700n);
      expect(tx).toBeInstanceOf(WalletTransactionEntity);
      expect(tx.amount).toBe(300n);
      expect(tx.balance_after).toBe(700n);
      expect(tx.type).toBe(WalletTransactionType.DEBIT);
      expect(tx.reason).toBe('test-debit');
    });

    it('throws InsufficientFundsException when balance too low', async () => {
      const user = createMockUser({ coins: 100n });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(
        service.debit(user, 500n, 'too-much'),
      ).rejects.toBeInstanceOf(InsufficientFundsException);
      // Balance should not have changed
      expect(user.coins).toBe(100n);
    });

    it('throws on non-positive amount', async () => {
      const user = createMockUser();

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(service.debit(user, 0n, 'bad')).rejects.toThrow(
        'Debit amount must be positive',
      );
    });

    it('allows debit of exact balance', async () => {
      const user = createMockUser({ coins: 500n });

      const tx = await service.debit(user, 500n, 'exact');

      expect(user.coins).toBe(0n);
      expect(tx.balance_after).toBe(0n);
    });
  });

  describe('transfer', () => {
    it('moves coins between users atomically', async () => {
      const from = createMockUser({ coins: 1000n, user_id: 111n });
      const to = createMockUser({ coins: 200n, user_id: 222n });

      const [debitTx, creditTx] = await service.transfer(from, to, 500n);

      expect(from.coins).toBe(500n);
      expect(to.coins).toBe(700n);

      expect(debitTx.type).toBe(WalletTransactionType.TRANSFER_OUT);
      expect(debitTx.amount).toBe(500n);
      expect(debitTx.balance_after).toBe(500n);
      expect(debitTx.related_user_id).toBe(222n);

      expect(creditTx.type).toBe(WalletTransactionType.TRANSFER_IN);
      expect(creditTx.amount).toBe(500n);
      expect(creditTx.balance_after).toBe(700n);
      expect(creditTx.related_user_id).toBe(111n);
    });

    it('throws InsufficientFundsException when sender balance too low', async () => {
      const from = createMockUser({ coins: 100n });
      const to = createMockUser({ coins: 0n });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(service.transfer(from, to, 500n)).rejects.toBeInstanceOf(
        InsufficientFundsException,
      );
      // Balances unchanged
      expect(from.coins).toBe(100n);
      expect(to.coins).toBe(0n);
    });

    it('throws on non-positive amount', async () => {
      const from = createMockUser();
      const to = createMockUser();

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(service.transfer(from, to, 0n)).rejects.toThrow(
        'Transfer amount must be positive',
      );
    });

    it('uses default reason "transfer"', async () => {
      const from = createMockUser({ coins: 1000n });
      const to = createMockUser({ coins: 0n });

      const [debitTx, creditTx] = await service.transfer(from, to, 100n);

      expect(debitTx.reason).toBe('transfer');
      expect(creditTx.reason).toBe('transfer');
    });

    it('uses custom reason when provided', async () => {
      const from = createMockUser({ coins: 1000n });
      const to = createMockUser({ coins: 0n });

      const [debitTx, creditTx] = await service.transfer(
        from,
        to,
        100n,
        'gift',
      );

      expect(debitTx.reason).toBe('gift');
      expect(creditTx.reason).toBe('gift');
    });

    it('uses em.transactional for atomicity', async () => {
      const from = createMockUser({ coins: 1000n });
      const to = createMockUser({ coins: 0n });

      await service.transfer(from, to, 100n);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHistory', () => {
    it('queries with correct filters', async () => {
      await service.getHistory('123', '456', {
        limit: 10,
        offset: 5,
        type: WalletTransactionType.CREDIT,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const { find } = mockTxRepo;
      expect(find).toHaveBeenCalledWith(
        {
          user_id: 123n,
          guild_id: 456n,
          type: WalletTransactionType.CREDIT,
        },
        {
          orderBy: { createdAt: 'DESC' },
          limit: 10,
          offset: 5,
        },
      );
    });

    it('uses defaults when no options provided', async () => {
      await service.getHistory('123', '456');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const { find } = mockTxRepo;
      expect(find).toHaveBeenCalledWith(
        {
          user_id: 123n,
          guild_id: 456n,
        },
        {
          orderBy: { createdAt: 'DESC' },
          limit: 50,
          offset: 0,
        },
      );
    });

    it('caps limit at 100', async () => {
      await service.getHistory('123', '456', { limit: 500 });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const { find } = mockTxRepo;
      expect(find).toHaveBeenCalledWith(
        {
          user_id: 123n,
          guild_id: 456n,
        },
        {
          orderBy: { createdAt: 'DESC' },
          limit: 100,
          offset: 0,
        },
      );
    });
  });
});
