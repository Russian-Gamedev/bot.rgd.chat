import { EntityRepository } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Channel,
  Client,
  Message,
  NewsChannel,
  TextChannel,
  WebhookClient,
} from 'discord.js';
import Redis from 'ioredis';
import { Context, type ContextOf, On } from 'necord';
import { PortalEntity } from './entities/portal.entity';
import { PortalBlacklistEntity } from './entities/portal-blacklist.entity';

const PORTAL_CACHE_KEY_PREFIX = 'portals:channel:';
const PORTAL_CACHE_TTL_SECONDS = 3600;
const BLACKLIST_CACHE_KEY = 'portals:blacklist';
const MSG_MAP_PREFIX = 'portals:msgmap:';
const MSG_MAP_TTL = 60 * 60 * 24 * 7;

interface MessageMapping {
  originalGuildId: string;
  originalChannelId: string;
  originalMessageId: string;
}

interface CachedPortalData {
  portalId: number;
  targetWebhookId: string;
  targetWebhookToken: string;
  targetGuildId: string;
  targetChannelId: string;
}

@Injectable()
export class PortalsService {
  private readonly logger = new Logger(PortalsService.name);

  constructor(
    @InjectRepository(PortalEntity)
    private readonly portalRepository: EntityRepository<PortalEntity>,
    @InjectRepository(PortalBlacklistEntity)
    private readonly blacklistRepository: EntityRepository<PortalBlacklistEntity>,
    private readonly em: EntityManager,
    private readonly client: Client,
    @Inject(Redis) private readonly redis: Redis,
  ) {}

  async createPortal(
    channelA: Channel,
    channelB: Channel,
    creatorId: bigint,
  ): Promise<PortalEntity> {
    const guildChannelA = channelA as TextChannel | NewsChannel;
    const guildChannelB = channelB as TextChannel | NewsChannel;

    const [webhookA, webhookB] = await Promise.all([
      guildChannelA.createWebhook({ name: 'RGD Portal' }),
      guildChannelB.createWebhook({ name: 'RGD Portal' }),
    ]);

    const portal = new PortalEntity();
    portal.guild_a_id = BigInt(guildChannelA.guildId);
    portal.guild_b_id = BigInt(guildChannelB.guildId);
    portal.channel_a_id = BigInt(channelA.id);
    portal.channel_b_id = BigInt(channelB.id);
    portal.webhook_a_id = webhookA.id;
    portal.webhook_a_token = webhookA.token!;
    portal.webhook_b_id = webhookB.id;
    portal.webhook_b_token = webhookB.token!;
    portal.created_by = creatorId;

    await this.em.persist(portal).flush();
    await this.cachePortal(portal);

    this.logger.log(
      `Portal #${portal.id} created between #${channelA.id} (guild ${guildChannelA.guildId}) and #${channelB.id} (guild ${guildChannelB.guildId}) by user ${creatorId}`,
    );

    return portal;
  }

  async deletePortal(id: number): Promise<void> {
    const portal = await this.portalRepository.findOne({ id });
    if (!portal) {
      throw new Error(`Портал #${id} не найден.`);
    }

    await this.em.nativeDelete(PortalEntity, { id });

    this.logger.log(`Portal #${id} deleted`);

    await Promise.all([
      this.invalidateCacheForChannel(portal.channel_a_id),
      this.invalidateCacheForChannel(portal.channel_b_id),
    ]);

    try {
      await this.deleteWebhook(portal.webhook_a_id, portal.webhook_a_token);
    } catch {
      this.logger.warn(
        `Failed to delete webhook ${portal.webhook_a_id} for portal #${id}`,
      );
    }

    try {
      await this.deleteWebhook(portal.webhook_b_id, portal.webhook_b_token);
    } catch {
      this.logger.warn(
        `Failed to delete webhook ${portal.webhook_b_id} for portal #${id}`,
      );
    }
  }

  async listPortals(): Promise<PortalEntity[]> {
    return this.portalRepository.findAll();
  }

  async addToBlacklist(userId: bigint): Promise<void> {
    const existing = await this.blacklistRepository.findOne({
      user_id: userId,
    });
    if (existing) return;

    const entry = new PortalBlacklistEntity();
    entry.user_id = userId;
    await this.em.persist(entry).flush();
    await this.invalidateBlacklistCache();

    this.logger.log(`User ${userId} added to portal blacklist`);
  }

  async removeFromBlacklist(userId: bigint): Promise<void> {
    await this.em.nativeDelete(PortalBlacklistEntity, { user_id: userId });
    await this.invalidateBlacklistCache();

    this.logger.log(`User ${userId} removed from portal blacklist`);
  }

  async listBlacklist(): Promise<bigint[]> {
    const cached = await this.redis.get(BLACKLIST_CACHE_KEY);
    if (cached) {
      const ids = JSON.parse(cached) as string[];
      return ids.map((id) => BigInt(id));
    }

    const entries = await this.blacklistRepository.findAll();
    const ids = entries.map((e) => e.user_id);

    await this.redis.set(
      BLACKLIST_CACHE_KEY,
      JSON.stringify(ids.map((id) => id.toString())),
      'EX',
      PORTAL_CACHE_TTL_SECONDS,
    );

    return ids;
  }

  async isBlacklisted(userId: bigint): Promise<boolean> {
    const cached = await this.redis.get(BLACKLIST_CACHE_KEY);
    if (cached) {
      const ids = JSON.parse(cached) as string[];
      return ids.includes(userId.toString());
    }

    const count = await this.blacklistRepository.count({
      user_id: userId,
    });
    return count > 0;
  }

  async findByChannelId(channelId: string): Promise<CachedPortalData | null> {
    const cacheKey = `${PORTAL_CACHE_KEY_PREFIX}${channelId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedPortalData;
      if (parsed.targetGuildId && parsed.targetChannelId) {
        this.logger.debug(`Cache hit for channel ${channelId}`);
        return parsed;
      }
      this.logger.warn(`Stale cache for channel ${channelId}, invalidating`);
      await this.redis.del(cacheKey);
    }

    this.logger.debug(`Cache miss for channel ${channelId}, querying DB`);

    const portal = await this.portalRepository.findOne({
      $or: [
        { channel_a_id: BigInt(channelId) },
        { channel_b_id: BigInt(channelId) },
      ],
    });

    if (!portal) {
      this.logger.debug(`No portal found for channel ${channelId}`);
      return null;
    }

    const isChannelA = portal.channel_a_id === BigInt(channelId);

    if (!portal.guild_a_id || !portal.guild_b_id) {
      this.logger.warn(
        `Portal #${portal.id} missing guild IDs, resolving from Discord`,
      );
      const [guildA, guildB] = await Promise.all([
        this.resolveChannelGuild(portal.channel_a_id.toString()),
        this.resolveChannelGuild(portal.channel_b_id.toString()),
      ]);
      const updateData: Record<string, bigint> = {};
      if (guildA) {
        portal.guild_a_id = BigInt(guildA);
        updateData.guild_a_id = portal.guild_a_id;
      }
      if (guildB) {
        portal.guild_b_id = BigInt(guildB);
        updateData.guild_b_id = portal.guild_b_id;
      }
      if (Object.keys(updateData).length > 0) {
        try {
          await this.portalRepository.nativeUpdate(
            { id: portal.id },
            updateData,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to persist guild IDs for portal #${portal.id}: ${String(error)}`,
          );
        }
      }
    }

    if (!portal.guild_a_id || !portal.guild_b_id) {
      this.logger.error(
        `Cannot resolve guild IDs for portal #${portal.id}, skipping`,
      );
      return null;
    }

    const data: CachedPortalData = {
      portalId: portal.id,
      targetWebhookId: isChannelA ? portal.webhook_b_id : portal.webhook_a_id,
      targetWebhookToken: isChannelA
        ? portal.webhook_b_token
        : portal.webhook_a_token,
      targetGuildId: isChannelA
        ? portal.guild_b_id.toString()
        : portal.guild_a_id.toString(),
      targetChannelId: isChannelA
        ? portal.channel_b_id.toString()
        : portal.channel_a_id.toString(),
    };

    await this.redis.set(
      cacheKey,
      JSON.stringify(data),
      'EX',
      PORTAL_CACHE_TTL_SECONDS,
    );

    return data;
  }

  private async resolveChannelGuild(channelId: string): Promise<string | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel && 'guildId' in channel && channel.guildId) {
        return channel.guildId;
      }
    } catch {
      this.logger.warn(`Failed to resolve guild for channel ${channelId}`);
    }
    return null;
  }

  @On('messageCreate')
  @EnsureRequestContext()
  public async onMessage(@Context() [message]: ContextOf<'messageCreate'>) {
    await this.relayMessage(message);
  }

  async relayMessage(message: Message): Promise<void> {
    if (message.webhookId) {
      this.logger.debug(`Skip relay: webhook message ${message.id}`);
      return;
    }
    if (message.author.bot) {
      this.logger.debug(`Skip relay: bot message ${message.id}`);
      return;
    }
    if (!message.guildId) {
      this.logger.debug(`Skip relay: no guild ${message.id}`);
      return;
    }

    if (await this.isBlacklisted(BigInt(message.author.id))) {
      this.logger.debug(`Skip relay: blacklisted user ${message.author.id}`);
      return;
    }

    const portalData = await this.findByChannelId(message.channelId);
    if (!portalData) {
      this.logger.debug(
        `Skip relay: no portal for channel ${message.channelId}`,
      );
      return;
    }

    this.logger.log(
      `Relaying message ${message.id} from #${message.channelId} (guild ${message.guildId}) via portal #${portalData.portalId} → #${portalData.targetChannelId} (guild ${portalData.targetGuildId})`,
    );

    let content = message.content
      .replace(/<@!?\d+>/g, '')
      .replace(/<@&\d+>/g, '')
      .replace(/@everyone/g, '')
      .replace(/@here/g, '')
      .trim();

    const replyLink = await this.resolveReplyLink(message);
    if (replyLink) {
      this.logger.debug(`Reply link for ${message.id}: ${replyLink}`);
      content = content ? `${replyLink}\n${content}` : replyLink;
    } else if (message.reference?.messageId) {
      this.logger.debug(
        `No reply link for ${message.id} ref=${message.reference.messageId}`,
      );
    }

    const avatarURL = message.author.displayAvatarURL();
    const username = message.member?.displayName ?? message.author.username;

    const webhook = new WebhookClient({
      id: portalData.targetWebhookId,
      token: portalData.targetWebhookToken,
    });

    try {
      const relayed = await webhook.send({
        content: content || undefined,
        username,
        avatarURL,
        files:
          message.attachments.size > 0
            ? [...message.attachments.values()]
            : undefined,
      });

      await this.saveMessageMapping(
        relayed.id ?? '',
        message.id ?? '',
        message.guildId ?? '',
        message.channelId ?? '',
        portalData.targetGuildId ?? '',
        portalData.targetChannelId ?? '',
      );

      this.logger.log(
        `Relayed message ${message.id} → webhook message ${relayed.id} via portal #${portalData.portalId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to relay message via portal #${portalData.portalId}: ${String(error)}`,
      );
    }
  }

  private async resolveReplyLink(message: Message): Promise<string | null> {
    const ref = message.reference;
    if (!ref?.messageId) return null;

    const raw = await this.redis.get(`${MSG_MAP_PREFIX}${ref.messageId}`);
    if (raw) {
      const mapping: MessageMapping = JSON.parse(raw);
      if (
        mapping.originalGuildId &&
        mapping.originalChannelId &&
        mapping.originalMessageId
      ) {
        return `https://discord.com/channels/${mapping.originalGuildId}/${mapping.originalChannelId}/${mapping.originalMessageId}`;
      }
      this.logger.warn(`Invalid message mapping for ${ref.messageId}: ${raw}`);
    }

    const resolvedChannel = message.channel as string | { id?: string };
    const guildId =
      ref.guildId ??
      message.guildId ??
      message.guild?.id ??
      (typeof message.guild === 'string' ? message.guild : null) ??
      null;

    const channelId =
      ref.channelId ??
      message.channelId ??
      (typeof resolvedChannel === 'string'
        ? resolvedChannel
        : resolvedChannel?.id) ??
      null;

    if (!guildId || !channelId) {
      this.logger.warn(
        `Cannot resolve reply link: guildId=${guildId} channelId=${channelId} ref=${JSON.stringify(ref)} msg=${message.id} guildIdProp=${message.guildId} channelIdProp=${message.channelId}`,
      );
      return null;
    }

    return `https://discord.com/channels/${guildId}/${channelId}/${ref.messageId}`;
  }

  private async saveMessageMapping(
    relayedMessageId: string,
    originalMessageId: string,
    originalGuildId: string,
    originalChannelId: string,
    relayedGuildId: string,
    relayedChannelId: string,
  ): Promise<void> {
    const value = JSON.stringify({
      originalGuildId,
      originalChannelId,
      originalMessageId,
    });

    const reverseValue = JSON.stringify({
      originalGuildId: relayedGuildId,
      originalChannelId: relayedChannelId,
      originalMessageId: relayedMessageId,
    });

    await Promise.all([
      this.redis.set(
        `${MSG_MAP_PREFIX}${relayedMessageId}`,
        value,
        'EX',
        MSG_MAP_TTL,
      ),
      this.redis.set(
        `${MSG_MAP_PREFIX}${originalMessageId}`,
        reverseValue,
        'EX',
        MSG_MAP_TTL,
      ),
    ]);
  }

  private async cachePortal(portal: PortalEntity): Promise<void> {
    const dataA: CachedPortalData = {
      portalId: portal.id,
      targetWebhookId: portal.webhook_b_id,
      targetWebhookToken: portal.webhook_b_token,
      targetGuildId: portal.guild_b_id.toString(),
      targetChannelId: portal.channel_b_id.toString(),
    };
    const dataB: CachedPortalData = {
      portalId: portal.id,
      targetWebhookId: portal.webhook_a_id,
      targetWebhookToken: portal.webhook_a_token,
      targetGuildId: portal.guild_a_id.toString(),
      targetChannelId: portal.channel_a_id.toString(),
    };

    await Promise.all([
      this.redis.set(
        `${PORTAL_CACHE_KEY_PREFIX}${portal.channel_a_id}`,
        JSON.stringify(dataA),
        'EX',
        PORTAL_CACHE_TTL_SECONDS,
      ),
      this.redis.set(
        `${PORTAL_CACHE_KEY_PREFIX}${portal.channel_b_id}`,
        JSON.stringify(dataB),
        'EX',
        PORTAL_CACHE_TTL_SECONDS,
      ),
    ]);
  }

  private async invalidateCacheForChannel(channelId: bigint): Promise<void> {
    await this.redis.del(`${PORTAL_CACHE_KEY_PREFIX}${channelId}`);
  }

  private async invalidateBlacklistCache(): Promise<void> {
    await this.redis.del(BLACKLIST_CACHE_KEY);
  }

  private async deleteWebhook(id: string, token: string): Promise<void> {
    const webhook = new WebhookClient({ id, token });
    await webhook.delete();
  }
}
