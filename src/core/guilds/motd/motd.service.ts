import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ActivityType, Client } from 'discord.js';
import Redis from 'ioredis';
import { Once } from 'necord';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { GuildSettingsService } from '../settings/guild-settings.service';
import { MotdEntity } from './entities/motd.entity';
import initRuntimeMotds from './runtime-motds';

const BOT_MOTD_INTERVAL = 60 * 1000;

@Injectable()
export class MotdService {
  private readonly logger = new Logger(MotdService.name);
  private readonly MOTD_CACHE_KEY = 'motd:queue';
  private readonly LIST_CACHE_KEY = 'motd:list:v1';
  private readonly LIST_CACHE_TTL_SECONDS = 60 * 60;
  private currentMotd: string | null = null;

  constructor(
    @InjectRepository(MotdEntity)
    private readonly motdRepository: EntityRepository<MotdEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
    @Inject(Redis) private readonly redis: Redis,
    private readonly guildSettingsService: GuildSettingsService,
  ) {
    this.runtimeMotdFunctions = initRuntimeMotds({
      redis: this.redis,
      client: this.client,
      guildSettingsService: this.guildSettingsService,
    });
  }

  @Once('clientReady')
  @EnsureRequestContext()
  async onBotReady() {
    /// fires immediately on startup to set the bot's MOTD status, then every minute via the Interval
    await this.setBotMotd();
  }

  @Interval('bot-motd', BOT_MOTD_INTERVAL)
  @EnsureRequestContext()
  async setBotMotdInterval() {
    if (!this.client.isReady()) return;
    await this.setBotMotd();
  }

  private async loadMotd() {
    const motds = await this.motdRepository.findAll();
    const entries: string[] = [
      ...motds.map((m) => `db:${m.content}`),
      ...this.runtimeMotdFunctions.map((_, i) => `runtime:${i}`),
    ];

    // Fisher-Yates shuffle
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    await this.redis.del(this.MOTD_CACHE_KEY);
    if (entries.length) {
      await this.redis.rpush(this.MOTD_CACHE_KEY, ...entries);
    }
  }

  async getMotd() {
    let entry = await this.redis.lpop(this.MOTD_CACHE_KEY);
    if (entry === null) {
      await this.loadMotd();
      entry = await this.redis.lpop(this.MOTD_CACHE_KEY);
    }
    if (entry === null) return null;

    if (entry.startsWith('db:')) {
      return entry.slice(3);
    }

    if (entry.startsWith('runtime:')) {
      const index = parseInt(entry.slice(8), 10);
      const func = this.runtimeMotdFunctions.at(index);
      if (!func) {
        this.logger.warn(`Invalid MOTD function index: ${index}`);
        return null;
      }
      return await func();
    }

    return entry;
  }

  async addMotd(content: string, authorId?: bigint) {
    const motd = new MotdEntity();
    motd.author_id = authorId;
    motd.content = content;
    await this.em.persist(motd).flush();
    await this.loadMotd();
    await this.redis.del(this.LIST_CACHE_KEY);
  }

  async removeMotd(id: number) {
    await this.em.nativeDelete(MotdEntity, { id });
    await this.loadMotd();
    await this.redis.del(this.LIST_CACHE_KEY);
  }

  async listMotds() {
    const cached = await this.redis.get(this.LIST_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    const motds = await this.motdRepository.findAll({
      orderBy: { id: 'DESC' },
    });
    const userIds = motds
      .filter((m) => m.author_id)
      .map((m) => BigInt(m.author_id!));

    const users =
      userIds.length > 0
        ? await this.em.find(UserProfileEntity, {
            user_id: { $in: userIds },
          })
        : [];
    const usersById = new Map(users.map((u) => [u.user_id.toString(), u]));

    const response = motds.map((motd) => {
      const userId = motd.author_id?.toString();
      const user = userId ? usersById.get(userId) : undefined;

      return {
        id: motd.id,
        content: motd.content,
        user: {
          username: user?.username ?? 'Unknown',
          avatar_url: user?.avatar_url ?? '',
          id: userId ?? '',
        },
      };
    });

    await this.redis.set(
      this.LIST_CACHE_KEY,
      JSON.stringify(response),
      'EX',
      this.LIST_CACHE_TTL_SECONDS,
    );

    return response;
  }

  getCurrentMotd() {
    return this.currentMotd;
  }

  async setBotMotd() {
    try {
      const motd = await this.getMotd();
      if (!motd) {
        this.logger.warn('No MOTD found to set as bot status.');
        return;
      }

      this.client.user?.setActivity(motd, { type: ActivityType.Playing });
      this.currentMotd = motd;
    } catch (error) {
      this.logger.error('Failed to set bot status:', error);
    }
  }

  private readonly runtimeMotdFunctions: (() => Promise<string> | string)[];
}
