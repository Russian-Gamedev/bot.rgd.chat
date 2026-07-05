import { describe, expect, it, mock } from 'bun:test';

import { BotEntity } from '#core/bots/entities/bot.entity';
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

  it('reads bot balance from the linked bot user id', async () => {
    const walletService = {
      getBalance: mock(() => Promise.resolve(42n)),
    } as unknown as WalletService;
    const controller = new WalletController(walletService, {} as UserService);
    const bot = new BotEntity();
    bot.id = 7;
    bot.botUserId = 999n;

    await expect(
      controller.getOwnBalance({
        type: ActorType.Bot,
        id: '7',
        bot,
      }),
    ).resolves.toEqual({ balance: '42' });

    expect(walletService.getBalance).toHaveBeenCalledWith('999');
  });

  it('reads bot history from the linked bot user id', async () => {
    const walletService = {
      getHistory: mock(() => Promise.resolve([])),
    } as unknown as WalletService;
    const controller = new WalletController(walletService, {} as UserService);
    const bot = new BotEntity();
    bot.id = 7;
    bot.botUserId = 999n;

    await controller.getOwnHistory(
      {
        type: ActorType.Bot,
        id: '7',
        bot,
      },
      {
        type: WalletTransactionType.CREDIT,
      },
    );

    expect(walletService.getHistory).toHaveBeenCalledWith('999', null, {
      type: WalletTransactionType.CREDIT,
    });
  });

  it('rejects unlinked bot tokens for own wallet endpoints', async () => {
    const walletService = {
      getBalance: mock(() => Promise.resolve(42n)),
    } as unknown as WalletService;
    const controller = new WalletController(walletService, {} as UserService);
    const bot = new BotEntity();
    bot.id = 7;
    bot.botUserId = null;

    await expect(
      controller.getOwnBalance({
        type: ActorType.Bot,
        id: '7',
        bot,
      }),
    ).rejects.toThrow('Bot token is not linked to a Discord profile.');

    expect(walletService.getBalance).not.toHaveBeenCalled();
  });
});
