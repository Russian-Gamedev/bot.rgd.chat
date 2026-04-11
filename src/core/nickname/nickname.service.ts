import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Client } from 'discord.js';
import { Redis } from 'ioredis';

import { NicknameHistoryEntity } from './entities/nickname-history.entity';

@Injectable()
export class NicknameService {
  private readonly logger = new Logger(NicknameService.name);

  constructor(
    @InjectRepository(NicknameHistoryEntity)
    private readonly nicknameHistoryRepository: EntityRepository<NicknameHistoryEntity>,
    private readonly em: EntityManager,
    @Inject(Redis)
    private readonly redis: Redis,
    private readonly client: Client,
  ) {}

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
  ): Promise<void> {
    const key = this.getRedisKey(guildId, userId);

    const member = await this.getMember(guildId, userId);
    const originalNickname = member?.nickname ?? member?.user.username ?? null;

    await this.redis.set(key, nickname, 'EX', ttlSeconds);

    if (member) {
      await member.setNickname(nickname, `Locked nickname set by ${setBy}`);
    }

    await this.recordChange(guildId, userId, originalNickname, nickname, setBy);

    this.logger.log(
      `Locked nickname set for user ${userId} in guild ${guildId}: ${nickname} (TTL: ${ttlSeconds}s)`,
    );
  }

  async hasLockedNickname(guildId: bigint, userId: bigint): Promise<boolean> {
    const key = this.getRedisKey(guildId, userId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async getLockedNickname(
    guildId: bigint,
    userId: bigint,
  ): Promise<string | null> {
    const key = this.getRedisKey(guildId, userId);
    const data = await this.redis.get(key);
    if (!data) return null;
    return data;
  }

  async clearLockedNickname(guildId: bigint, userId: bigint): Promise<boolean> {
    const key = this.getRedisKey(guildId, userId);
    const lockedNickname = await this.getLockedNickname(guildId, userId);

    if (!lockedNickname) return true; // No locked nickname to clear

    await this.redis.del(key);

    return true;
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
