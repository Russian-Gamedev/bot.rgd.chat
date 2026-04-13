import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { ActivityType, Client } from 'discord.js';
import { On } from 'necord';

import { choose, formatTime, pluralize } from '#root/lib/utils';

import { MotdEntity } from './entities/motd.entity';

type MotdFunction = () => Promise<string> | string;
type MotdEntry = MotdFunction | string;

@Injectable()
export class MotdService {
  private readonly logger = new Logger(MotdService.name);
  private readonly INTERVAL = 60 * 1000; // 1 minute
  private motdCache = new Set<MotdEntry>();

  constructor(
    @InjectRepository(MotdEntity)
    private readonly motdRepository: EntityRepository<MotdEntity>,
    private readonly entityManager: EntityManager,
    private readonly client: Client,
  ) {}

  @On('clientReady')
  async onBotReady() {
    /// fires immediately on startup to set the bot's MOTD status, then every minute via the Interval
    await this.setBotMotd();
    setInterval(() => this.setBotMotd(), this.INTERVAL);
  }

  private async loadMotd() {
    const motds = await this.motdRepository.findAll();
    if (!motds.length) {
      this.motdCache.clear();
      return;
    }
    this.motdCache = new Set(motds.map((m) => m.content));
    this.runtimeMotdFunctions().forEach((fn) => this.motdCache.add(fn));
  }

  async getMotd() {
    if (this.motdCache.size === 0) {
      await this.loadMotd();
    }
    if (!this.motdCache.size) return null;
    const motdArray = Array.from(this.motdCache);
    const motd = choose(motdArray);

    // Remove from cache to prevent repeats until refetch
    this.motdCache.delete(motd);

    if (typeof motd === 'function') {
      return await motd();
    }

    return motd;
  }

  async addMotd(content: string, authorId?: bigint) {
    const motd = new MotdEntity();
    motd.author_id = authorId;
    motd.content = content;
    await this.entityManager.persist(motd).flush();
    await this.loadMotd();
  }

  async removeMotd(id: number) {
    await this.entityManager.nativeDelete(MotdEntity, { id });
    await this.loadMotd();
  }

  async listMotds() {
    return this.motdRepository.findAll();
  }

  async setBotMotd() {
    const motd = await this.getMotd();
    if (!motd) {
      this.logger.warn('No MOTD found to set as bot status.');
      return;
    }
    try {
      this.client.user?.setActivity(motd, { type: ActivityType.Playing });
    } catch (error) {
      this.logger.error('Failed to set bot status:', error);
    }
  }

  private runtimeMotdFunctions() {
    return [
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
      () => `⏳ Осталось ${this.motdCache.size} что-то там в очереди...`,
      () => {
        const days = Math.floor(Math.random() * 30) + 10;
        const plural = pluralize(days, ['день', 'дня', 'дней']);
        return `🎉 Следующий джем через ${days} ${plural}!`;
      },
      () =>
        `Я жив уже ${formatTime(Math.floor(process.uptime()))}. Чувствую себя отлично!`,
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
      () => `Новый проект №${Math.floor(Math.random() * 1000) + 100}!`,
      () =>
        `Опечаток в чате: ${Math.floor(Math.random() * 10) + 1} (autofix не помог)`,
      () => {
        const chars = '•၊၊||၊|။||||||||။၊|';
        let voice = '';
        for (let i = 0; i < 12; i++) {
          voice += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return `▶︎ •${voice}• 0:${Math.floor(Math.random() * 59)}`;
      },
    ];
  }
}
