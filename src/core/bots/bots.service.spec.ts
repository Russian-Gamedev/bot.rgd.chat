import { describe, expect, it, mock } from 'bun:test';
import type { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Permission } from '#core/permissions/permissions.types';
import type { UserService } from '#core/users/users.service';
import type { WalletService } from '#core/wallet/wallet.service';
import { BotsService } from './bots.service';
import { BotEntity } from './entities/bot.entity';

describe('BotsService', () => {
  it('creates bot token linked to a Discord bot user profile', async () => {
    const entityManager = {
      persist: mock((entity: BotEntity) => {
        entity.id = 42;
        return entityManager;
      }),
      flush: mock(async () => undefined),
    } as unknown as EntityManager;
    const userService = {
      findOrCreateProfile: mock(async () => undefined),
      findOrCreateMember: mock(async () => undefined),
    } as unknown as UserService;
    const walletService = {
      getOrCreateWallet: mock(async () => undefined),
    } as unknown as WalletService;
    const service = new BotsService(
      {} as EntityRepository<BotEntity>,
      entityManager,
      userService,
      walletService,
    );

    const result = await service.createBot(
      'Test Bot',
      111n,
      222n,
      [Permission.GuildRead],
      333n,
    );

    expect(userService.findOrCreateProfile).toHaveBeenCalledWith(222n);
    expect(userService.findOrCreateMember).toHaveBeenCalledWith(333n, 222n);
    expect(walletService.getOrCreateWallet).toHaveBeenCalledWith(222n);
    expect(entityManager.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Bot',
        ownerId: 111n,
        botUserId: 222n,
        permissions: [Permission.GuildRead],
      }) as BotEntity,
    );
    expect(result.access_token.startsWith('42:bot_')).toBe(true);
  });
});
