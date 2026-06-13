import { describe, expect, it, mock } from 'bun:test';

import { ActorType } from '#core/permissions/permissions.types';
import { UserService } from '#core/users/users.service';
import { WalletTransactionType } from './entities/wallet-transaction.entity';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

describe('WalletController', () => {
  it('reads user history across all guilds', async () => {
    const walletService = {
      getHistory: mock(() => Promise.resolve([])),
    } as unknown as WalletService;
    const controller = new WalletController(walletService, {} as UserService);

    await controller.getOwnHistory(
      { type: ActorType.User, id: '123', username: 'alice' },
      {
        type: WalletTransactionType.CREDIT,
      },
    );

    expect(walletService.getHistory).toHaveBeenCalledWith('123', null, {
      type: WalletTransactionType.CREDIT,
    });
  });
});
