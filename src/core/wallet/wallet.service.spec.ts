import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

import { UserEntity } from '#core/users/entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import {
  WalletTransactionEntity,
  WalletTransactionType,
} from './entities/wallet-transaction.entity';
import {
  InsufficientFundsException,
  InvalidAmountException,
} from './wallet.exception';
import { WalletService } from './wallet.service';

function createMockUser(overrides: Partial<UserEntity> = {}): UserEntity {
  const user = new UserEntity();
  user.id = 1;
  user.user_id = 123456789n;
  user.guild_id = 987654321n;
  user.username = 'testuser';
  user.avatar = 'avatar.png';
  Object.assign(user, overrides);
  return user;
}

function createMockWallet(overrides: Partial<WalletEntity> = {}): WalletEntity {
  const wallet = new WalletEntity();
  wallet.user_id = 123456789n;
  wallet.coins = 1000n;
  Object.assign(wallet, overrides);
  return wallet;
}

describe('WalletService', () => {
  let service: WalletService;
  let mockEm: EntityManager;
  let innerEm: EntityManager;
  let mockWalletRepo: EntityRepository<WalletEntity>;
  let mockTxRepo: EntityRepository<WalletTransactionEntity>;

  beforeEach(() => {
    mockWalletRepo = {
      find: mock(() => Promise.resolve([])),
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<WalletEntity>;

    mockTxRepo = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<WalletTransactionEntity>;

    innerEm = {
      findOne: mock(() => Promise.resolve(null)),
      persist: mock(() => innerEm),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;

    mockEm = {
      persist: mock(() => mockEm),
      flush: mock(() => Promise.resolve()),
      transactional: mock(async (cb: (em: EntityManager) => Promise<unknown>) =>
        cb(innerEm),
      ),
    } as unknown as EntityManager;

    service = new WalletService(mockWalletRepo, mockTxRepo, mockEm);
  });

  describe('getBalance', () => {
    it('returns 0n when wallet not found', async () => {
      const balance = await service.getBalance('111');
      expect(balance).toBe(0n);
    });

    it('returns global wallet coins when wallet exists', async () => {
      const wallet = createMockWallet({ coins: 5000n });
      (mockWalletRepo.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        wallet,
      );

      const balance = await service.getBalance('123456789');
      expect(balance).toBe(5000n);
      expect(mockWalletRepo.findOne).toHaveBeenCalledWith({
        user_id: 123456789n,
      });
    });
  });

  describe('credit', () => {
    it('adds coins to wallet and creates transaction', async () => {
      const user = createMockUser();
      const wallet = createMockWallet({ coins: 1000n });
      (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        wallet,
      );

      const tx = await service.credit(user, 500n, 'test-credit');

      expect(wallet.coins).toBe(1500n);
      expect(tx).toBeInstanceOf(WalletTransactionEntity);
      expect(tx.amount).toBe(500n);
      expect(tx.balance_after).toBe(1500n);
      expect(tx.type).toBe(WalletTransactionType.CREDIT);
      expect(tx.reason).toBe('test-credit');
      expect(tx.user_id).toBe(user.user_id);
      expect(tx.guild_id).toBe(user.guild_id);
    });

    it('creates wallet on first credit', async () => {
      const user = createMockUser();

      const tx = await service.credit(user, 500n, 'test-credit');

      expect(tx.balance_after).toBe(500n);
      const persisted = (innerEm.persist as ReturnType<typeof mock>).mock.calls;
      expect(persisted[0]?.[0]).toBeInstanceOf(WalletEntity);
    });

    it('throws on non-positive amount', async () => {
      const user = createMockUser();

      expect(service.credit(user, 0n, 'bad')).rejects.toBeInstanceOf(
        InvalidAmountException,
      );
      expect(service.credit(user, -5n, 'bad')).rejects.toBeInstanceOf(
        InvalidAmountException,
      );
    });

    it('stores metadata when provided', async () => {
      const user = createMockUser();
      const wallet = createMockWallet({ coins: 100n });
      const meta = { game: 'flip', bet: 50 };
      (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        wallet,
      );

      const tx = await service.credit(user, 50n, 'mini-game:flip', meta);

      expect(tx.metadata).toEqual(meta);
    });

    it('uses em.transactional for atomicity', async () => {
      const user = createMockUser();

      await service.credit(user, 100n, 'test');

      expect(mockEm.transactional).toHaveBeenCalledTimes(1);
    });
  });

  describe('debit', () => {
    it('subtracts coins from wallet and creates transaction', async () => {
      const user = createMockUser();
      const wallet = createMockWallet({ coins: 1000n });
      (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        wallet,
      );

      const tx = await service.debit(user, 300n, 'test-debit');

      expect(wallet.coins).toBe(700n);
      expect(tx).toBeInstanceOf(WalletTransactionEntity);
      expect(tx.amount).toBe(300n);
      expect(tx.balance_after).toBe(700n);
      expect(tx.type).toBe(WalletTransactionType.DEBIT);
      expect(tx.reason).toBe('test-debit');
    });

    it('throws InsufficientFundsException when balance too low', async () => {
      const user = createMockUser();
      const wallet = createMockWallet({ coins: 100n });
      (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        wallet,
      );

      await expect(
        service.debit(user, 500n, 'too-much'),
      ).rejects.toBeInstanceOf(InsufficientFundsException);
      expect(wallet.coins).toBe(100n);
    });

    it('throws on non-positive amount', async () => {
      const user = createMockUser();

      await expect(service.debit(user, 0n, 'bad')).rejects.toBeInstanceOf(
        InvalidAmountException,
      );
    });

    it('allows debit of exact balance', async () => {
      const user = createMockUser();
      const wallet = createMockWallet({ coins: 500n });
      (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        wallet,
      );

      const tx = await service.debit(user, 500n, 'exact');

      expect(wallet.coins).toBe(0n);
      expect(tx.balance_after).toBe(0n);
    });
  });

  describe('transfer', () => {
    it('moves coins between wallets atomically', async () => {
      const from = createMockUser({ user_id: 111n });
      const to = createMockUser({ user_id: 222n });
      const fromWallet = createMockWallet({ user_id: 111n, coins: 1000n });
      const toWallet = createMockWallet({ user_id: 222n, coins: 200n });
      (innerEm.findOne as ReturnType<typeof mock>)
        .mockResolvedValueOnce(fromWallet)
        .mockResolvedValueOnce(toWallet);

      const [debitTx, creditTx] = await service.transfer(from, to, 500n);

      expect(fromWallet.coins).toBe(500n);
      expect(toWallet.coins).toBe(700n);

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
      const from = createMockUser({ user_id: 111n });
      const to = createMockUser({ user_id: 222n });
      const fromWallet = createMockWallet({ user_id: 111n, coins: 100n });
      (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
        fromWallet,
      );

      await expect(service.transfer(from, to, 500n)).rejects.toBeInstanceOf(
        InsufficientFundsException,
      );
      expect(fromWallet.coins).toBe(100n);
    });

    it('throws on non-positive amount', async () => {
      const from = createMockUser();
      const to = createMockUser();

      await expect(service.transfer(from, to, 0n)).rejects.toBeInstanceOf(
        InvalidAmountException,
      );
    });

    it('uses default reason "transfer"', async () => {
      const from = createMockUser({ user_id: 111n });
      const to = createMockUser({ user_id: 222n });
      (innerEm.findOne as ReturnType<typeof mock>)
        .mockResolvedValueOnce(
          createMockWallet({ user_id: 111n, coins: 1000n }),
        )
        .mockResolvedValueOnce(createMockWallet({ user_id: 222n, coins: 0n }));

      const [debitTx, creditTx] = await service.transfer(from, to, 100n);

      expect(debitTx.reason).toBe('transfer');
      expect(creditTx.reason).toBe('transfer');
    });

    it('uses custom reason when provided', async () => {
      const from = createMockUser({ user_id: 111n });
      const to = createMockUser({ user_id: 222n });
      (innerEm.findOne as ReturnType<typeof mock>)
        .mockResolvedValueOnce(
          createMockWallet({ user_id: 111n, coins: 1000n }),
        )
        .mockResolvedValueOnce(createMockWallet({ user_id: 222n, coins: 0n }));

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
      const from = createMockUser({ user_id: 111n });
      const to = createMockUser({ user_id: 222n });
      (innerEm.findOne as ReturnType<typeof mock>)
        .mockResolvedValueOnce(
          createMockWallet({ user_id: 111n, coins: 1000n }),
        )
        .mockResolvedValueOnce(createMockWallet({ user_id: 222n, coins: 0n }));

      await service.transfer(from, to, 100n);

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

      expect(mockTxRepo.find).toHaveBeenCalledWith(
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

      expect(mockTxRepo.find).toHaveBeenCalledWith(
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

      expect(mockTxRepo.find).toHaveBeenCalledWith(
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
