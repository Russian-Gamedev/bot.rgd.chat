import crypto from 'node:crypto';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Permission } from '#core/permissions/permissions.types';
import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import { DiscordID } from '#root/lib/types';
import { BotEntity } from './entities/bot.entity';

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    @InjectRepository(BotEntity)
    private readonly botsRepository: EntityRepository<BotEntity>,
    private readonly entityManager: EntityManager,
    private readonly userService: UserService,
    private readonly walletService: WalletService,
  ) {}

  async createBot(
    name: string,
    ownerId: bigint,
    botUserId: bigint,
    permissions: Permission[],
    guildId?: DiscordID,
  ) {
    const rawToken = 'bot_' + crypto.randomBytes(32).toString('hex');
    const hashedToken = await Bun.password.hash(rawToken, {
      algorithm: 'bcrypt',
    });
    await this.userService.findOrCreateProfile(botUserId);
    await this.walletService.getOrCreateWallet(botUserId);
    if (guildId) {
      await this.userService.findOrCreateMember(guildId, botUserId);
    }

    const bot = new BotEntity();
    bot.name = name;
    bot.ownerId = ownerId;
    bot.botUserId = botUserId;
    bot.permissions = permissions;
    bot.tokenHash = hashedToken;

    await this.entityManager.persist(bot).flush();

    this.logger.log(`Created new bot with ID ${bot.id} and name ${name}`);

    const access_token = bot.id + ':' + rawToken;

    return { access_token };
  }

  async verifyToken(token: string): Promise<BotEntity | null> {
    const [idStr, tokenStr] = token.split(':', 2);
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id) || !tokenStr) return null;

    const bot = await this.botsRepository.findOne({ id });
    if (!bot) return null;
    const isValid = await Bun.password.verify(
      tokenStr,
      bot.tokenHash,
      'bcrypt',
    );
    if (!isValid) return null;

    bot.lastUsedAt = new Date();
    return bot;
  }

  async findByName(name: string): Promise<BotEntity | null> {
    return this.botsRepository.findOne({ name });
  }

  async deleteBot(id: number): Promise<void> {
    const bot = await this.botsRepository.findOne({ id });
    if (!bot) return;
    await this.entityManager.remove(bot).flush();
    this.logger.log(`Deleted bot with ID ${id} and name ${bot.name}`);
  }
}
