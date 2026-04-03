import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ActivityType, Client } from 'discord.js';
import { On } from 'necord';

import { MotdEntity } from './entities/motd.entity';

@Injectable()
export class MotdService {
  private readonly logger = new Logger(MotdService.name);
  private motdCache = new Set<string>();
  private currentMotdIndex = 0;

  constructor(
    @InjectRepository(MotdEntity)
    private readonly motdRepository: EntityRepository<MotdEntity>,
    private readonly entityManager: EntityManager,
    private readonly client: Client,
  ) {}

  @On('clientReady')
  async onBotReady() {
    /// fires immediately on startup to set the bot's MOTD status, then every minute via the Cron job
    await this.setBotMotd();
  }

  private async loadMotd() {
    const motds = await this.motdRepository.findAll();
    if (!motds.length) {
      this.motdCache.clear();
      return;
    }
    this.motdCache = new Set(motds.map((m) => m.content));
    this.currentMotdIndex %= this.motdCache.size; // Ensure index is within bounds after reload
  }

  async getMotd() {
    await this.loadMotd();
    if (!this.motdCache.size) return null;
    const motdArray = Array.from(this.motdCache);
    const motd = motdArray[this.currentMotdIndex];
    this.currentMotdIndex = (this.currentMotdIndex + 1) % motdArray.length;
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

  @Cron('* * * * *') // Every minute
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
}
