import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Client } from 'discord.js';
import { Redis } from 'ioredis';

import { WalletService } from '#core/wallet/wallet.service';

import { NicknameHistoryEntity } from './entities/nickname-history.entity';

export interface NicknameLock {
  nickname: string;
  cost: bigint;
  expiresAt: number;
}

@Injectable()
export class NicknameService implements OnModuleInit {
  private readonly logger = new Logger(NicknameService.name);

  constructor(
    @InjectRepository(NicknameHistoryEntity)
    private readonly nicknameHistoryRepository: EntityRepository<NicknameHistoryEntity>,
    private readonly em: EntityManager,
    @Inject(Redis)
    private readonly redis: Redis,
    private readonly client: Client,
    readonly _walletService: WalletService,
  ) {}

  async onModuleInit(): Promise<void> {
    ///
  }

  private getRedisKey(guildId: bigint, userId: bigint): string {
    return `nickname:locked:${guildId}:${userId}`;
  }

  async recordChange(
    guildId: bigint,
    userId: bigint,
    oldNickname: string | null,
    newNickname: string,
    changedBy: bigint,
  ): Promise<NicknameHistoryEntity> {
    const history = new NicknameHistoryEntity();
    history.user_id = userId;
    history.guild_id = guildId;
    history.old_nickname = oldNickname;
    history.new_nickname = newNickname;
    history.changed_by = changedBy;

    await this.em.persist(history).flush();

    return history;
  }

  async setLockedNickname(
    guildId: bigint,
    userId: bigint,
    nickname: string,
    ttlSeconds: number,
    setBy: bigint,
    cost: bigint,
  ): Promise<void> {
    const key = this.getRedisKey(guildId, userId);

    const member = await this.getMember(guildId, userId);
    const originalNickname = member?.nickname ?? member?.user.username ?? null;

    const lock = { nickname, cost: cost.toString() };
    await this.redis.set(key, JSON.stringify(lock), 'EX', ttlSeconds);

    if (member) {
      await member.setNickname(nickname, `Locked nickname set by ${setBy}`);
    }

    await this.recordChange(guildId, userId, originalNickname, nickname, setBy);

    this.logger.log(
      `Locked nickname set for user ${userId} in guild ${guildId}: ${nickname} (TTL: ${ttlSeconds}s, cost: ${cost})`,
    );
  }

  async getLockInfo(
    guildId: bigint,
    userId: bigint,
  ): Promise<NicknameLock | null> {
    const key = this.getRedisKey(guildId, userId);
    const data = await this.redis.get(key);
    if (!data) return null;

    const parsed = this.parseLock(data);
    if (!parsed) return null;

    const ttlSeconds = await this.redis.ttl(key);
    const expiresAt =
      ttlSeconds > 0 ? Math.floor(Date.now() / 1000) + ttlSeconds : 0;

    return { ...parsed, expiresAt };
  }

  async hasLockedNickname(guildId: bigint, userId: bigint): Promise<boolean> {
    return (await this.getLockInfo(guildId, userId)) !== null;
  }

  async getLockedNickname(
    guildId: bigint,
    userId: bigint,
  ): Promise<string | null> {
    return (await this.getLockInfo(guildId, userId))?.nickname ?? null;
  }

  async clearLockedNickname(guildId: bigint, userId: bigint): Promise<boolean> {
    return (await this.redis.del(this.getRedisKey(guildId, userId))) > 0;
  }

  private parseLock(data: string): { nickname: string; cost: bigint } | null {
    try {
      const lock = JSON.parse(data) as { nickname: unknown; cost: unknown };
      if (typeof lock.nickname !== 'string' || typeof lock.cost !== 'string') {
        return null;
      }
      return { nickname: lock.nickname, cost: BigInt(lock.cost) };
    } catch {
      return null;
    }
  }

  async getHistory(
    guildId: bigint,
    userId: bigint,
    limit = 10,
  ): Promise<NicknameHistoryEntity[]> {
    const history = await this.nicknameHistoryRepository.find(
      {
        guild_id: guildId,
        user_id: userId,
      },
      {
        orderBy: { createdAt: 'DESC' },
        limit,
      },
    );

    return history;
  }

  private async getMember(guildId: bigint, userId: bigint) {
    const guild = this.client.guilds.cache.get(String(guildId));
    if (!guild) return null;
    return guild.members.fetch(String(userId)).catch(() => null);
  }
}
