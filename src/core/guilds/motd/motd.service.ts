import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActivityType, Client } from 'discord.js';
import Redis from 'ioredis';
import { On } from 'necord';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { formatTime, pluralize } from '#lib/utils';
import { GuildSettingsService } from '../settings/guild-settings.service';
import { MotdEntity } from './entities/motd.entity';

@Injectable()
export class MotdService {
  private readonly logger = new Logger(MotdService.name);
  private readonly INTERVAL = 60 * 1000; // 1 minute
  private readonly MOTD_CACHE_KEY = 'motd:queue';
  private readonly LIST_CACHE_KEY = 'motd:list:v1';
  private readonly LIST_CACHE_TTL_SECONDS = 60 * 60;
  private currentMotd: string | null = null;

  constructor(
    @InjectRepository(MotdEntity)
    private readonly motdRepository: EntityRepository<MotdEntity>,
    private readonly entityManager: EntityManager,
    private readonly client: Client,
    @Inject(Redis) private readonly redis: Redis,
    private readonly guildSettingsService: GuildSettingsService,
  ) {}

  @On('clientReady')
  async onBotReady() {
    /// fires immediately on startup to set the bot's MOTD status, then every minute via the Interval
    await this.setBotMotd();
    setInterval(() => this.setBotMotd(), this.INTERVAL);

    const last = await this.runtimeMotdFunctions?.at(-1)?.();
    console.log(last);
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
    await this.entityManager.persist(motd).flush();
    await this.loadMotd();
    await this.redis.del(this.LIST_CACHE_KEY);
  }

  async removeMotd(id: number) {
    await this.entityManager.nativeDelete(MotdEntity, { id });
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
        ? await this.entityManager.find(UserProfileEntity, {
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
    const motd = await this.getMotd();
    if (!motd) {
      this.logger.warn('No MOTD found to set as bot status.');
      return;
    }
    try {
      this.client.user?.setActivity(motd, { type: ActivityType.Playing });
      this.currentMotd = motd;
    } catch (error) {
      this.logger.error('Failed to set bot status:', error);
    }
  }

  private readonly runtimeMotdFunctions: (() => Promise<string> | string)[] = [
    () => `🎲 Твой шанс сегодня: ${Math.floor(Math.random() * 100)}%`,
    () =>
      `👥 Онлайн: ${Math.floor(Math.random() * 1000)} (да, мы тоже не верим)`,
    () => {
      const h = new Date().getHours();
      if (h < 6) return '🌙 Ты вообще спишь?';
      if (h < 12) return '☀️ Утро. Ты снова здесь';
      if (h < 18) return '💼 Днем работаешь? Не верю';
      return '🌆 Вечер. Время ломать билд';
    },
    () => `🎮 FPS: ${Math.floor(20 + Math.random() * 120)} (нормально)`,
    () => {
      const hours = Math.floor(Math.random() * 48);
      const plural = pluralize(hours, ['час', 'часа', 'часов']);
      return `⏳ До релиза: ${hours} ${plural}`;
    },
    () => {
      const win = Math.random() > 0.8;
      return win ? '🎉 Ты выиграл ничего' : '💀 Ты проиграл всё';
    },
    async () => {
      const remaining = await this.redis.llen(this.MOTD_CACHE_KEY);
      return `⏳ Осталось ${remaining} что-то там в очереди...`;
    },
    () => {
      const days = Math.floor(Math.random() * 30) + 10;
      const plural = pluralize(days, ['день', 'дня', 'дней']);
      return `🎉 Следующий джем через ${days} ${plural}!`;
    },
    () =>
      `Я жив уже ${formatTime(Math.floor(process.uptime()), 2)}. Чувствую себя отлично!`,
    () => {
      const botBirthday = new Date('2020-07-21');
      const now = new Date();
      const age = Math.floor(
        (now.getTime() - botBirthday.getTime()) / (1000 * 60 * 60 * 24 * 365),
      );
      const plural = pluralize(age, ['год', 'года', 'лет']);
      return `🎂 Мне уже ${age} ${plural}!`;
    },
    () => {
      const rgdBirthday = new Date('2018-10-24');
      const now = new Date();
      const age = Math.floor(
        (now.getTime() - rgdBirthday.getTime()) / (1000 * 60 * 60 * 24 * 365),
      );
      const plural = pluralize(age, ['год', 'года', 'лет']);
      return `🎉 RGD уже ${age} ${plural}!`;
    },
    () => `Новый проект #${Math.floor(Math.random() * 1000) + 100}!`,
    () =>
      `Опечаток в чате: ${Math.floor(Math.random() * 10) + 1} (autofix не помог)`,
    () => {
      const chars = '•၊၊||၊|။||||||||။၊|';
      let voice = '';
      for (let i = 0; i < 12; i++) {
        voice += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      const seconds = Math.floor(1 + Math.random() * 58)
        .toString()
        .padStart(2, '0');
      return `▶︎ •${voice}• 00:${seconds}`;
    },
    async () => {
      const emojis = [
        '😎',
        '🤬',
        '🤡',
        '💩',
        '☠️',
        '😼',
        '🧠',
        '🦊',
        '🙈',
        '🌈',
        '💨',
        '🏆',
        '🎰',
        '🎮',
        '💸',
        '💰',
        '🔫',
        '❤️',
        '💯',
        '⚠️',
      ];

      const guilds = [...this.client.guilds.cache.values()];

      const activeRoles = await Promise.all(
        guilds.map((guild) =>
          this.guildSettingsService.getActiveRole(guild.id),
        ),
      );

      const eligibleMembers = guilds.flatMap((guild) =>
        guild.members.cache
          .filter((member) =>
            member.roles.cache.some((role) => activeRoles.includes(role)),
          )
          .map((member) => member.user.displayName),
      );

      if (eligibleMembers.length === 0) {
        return '🤷 Nobody found';
      }

      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

      const randomMember =
        eligibleMembers[Math.floor(Math.random() * eligibleMembers.length)];

      return `${randomEmoji} ${randomMember}`;
    },
  ];
}
