import { Inject, Injectable, Logger } from '@nestjs/common';
import { Attachment, Message, PermissionFlagsBits } from 'discord.js';
import Redis from 'ioredis';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import {
  extractNormalizedUrls,
  hashArrayBuffer,
  hashValue,
  hitFixedWindowThreshold,
  isImageAttachment,
  normalizeMessageText,
} from '#lib/utils';

import {
  MahoragaCaseStatus,
  MahoragaDetection,
  MahoragaDetectionMode,
  MahoragaDetectionSettings,
  MahoragaEvidence,
  MahoragaReason,
} from './mahoraga.types';

const TEXT_REPEAT_LIMIT = 3;
const TEXT_WINDOW_SECONDS = 30;
const LINK_REPEAT_LIMIT = 3;
const LINK_WINDOW_SECONDS = 60;
const IMAGE_REPEAT_LIMIT = 2;
const IMAGE_WINDOW_SECONDS = 600;
const YOUNG_ACCOUNT_MONTHS = 3;
const MESSAGE_TRACKING_WINDOW_SECONDS = 600;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

@Injectable()
export class MahoragaDetectionService {
  private readonly logger = new Logger(MahoragaDetectionService.name);

  constructor(
    @Inject(Redis)
    private readonly redis: Redis,
    private readonly guildSettings: GuildSettingsService,
  ) {}

  async inspectMessage(message: Message): Promise<MahoragaDetection | null> {
    if (await this.shouldIgnoreMessage(message)) return null;

    const guildId = message.guildId!;
    const settings = await this.getDetectionSettings(guildId);

    await this.trackMessage(
      guildId,
      message.author.id,
      message.channelId,
      message.id,
      settings.messageTrackingWindowSeconds,
    );

    const honeypotChannelId = await this.guildSettings.getSetting<string>(
      guildId,
      GuildSettings.MahoragaHoneypotChannelId,
      null,
    );
    if (
      settings.honeypotMode !== MahoragaDetectionMode.Off &&
      honeypotChannelId &&
      message.channelId === honeypotChannelId
    ) {
      return this.buildDetection(
        message,
        settings,
        MahoragaReason.Honeypot,
        'honeypot channel',
      );
    }

    if (settings.repeatMode !== MahoragaDetectionMode.Off) {
      for (const url of extractNormalizedUrls(message.content)) {
        const isRepeated = await this.hitDetector(
          'link',
          guildId,
          message.author.id,
          url,
          settings.linkRepeatLimit,
          settings.linkWindowSeconds,
        );
        if (isRepeated) {
          return this.buildDetection(
            message,
            settings,
            MahoragaReason.LinkRepeat,
            url,
            { url },
          );
        }
      }

      const imageHashes = new Set<string>();
      for (const attachment of message.attachments.values()) {
        const imageHash = await this.getImageAttachmentHash(attachment);
        if (!imageHash || imageHashes.has(imageHash)) continue;
        imageHashes.add(imageHash);

        const isRepeated = await this.hitDetector(
          'image',
          guildId,
          message.author.id,
          imageHash,
          settings.imageRepeatLimit,
          settings.imageWindowSeconds,
        );
        if (isRepeated) {
          return this.buildDetection(
            message,
            settings,
            MahoragaReason.ImageRepeat,
            imageHash,
            { imageHash },
          );
        }
      }

      const normalizedText = normalizeMessageText(message.content);
      if (normalizedText.length >= 4) {
        const textHash = hashValue(normalizedText);
        const isRepeated = await this.hitDetector(
          'text',
          guildId,
          message.author.id,
          textHash,
          settings.textRepeatLimit,
          settings.textWindowSeconds,
        );
        if (isRepeated) {
          return this.buildDetection(
            message,
            settings,
            MahoragaReason.TextRepeat,
            textHash,
            { textHash },
          );
        }
      }
    }

    return null;
  }

  private buildDetection(
    message: Message,
    settings: MahoragaDetectionSettings,
    reason: MahoragaReason,
    matchedValue: string,
    extra: Partial<MahoragaEvidence> = {},
  ): MahoragaDetection {
    const detectorMode = this.getDetectorMode(settings, reason);
    const status =
      detectorMode === MahoragaDetectionMode.Monitor
        ? MahoragaCaseStatus.Observed
        : this.getEnforcedStatus(message.author.createdTimestamp, settings);

    return {
      userId: message.author.id,
      guildId: message.guildId!,
      channelId: message.channelId,
      status,
      reason,
      settings,
      evidence: {
        reason,
        guildId: message.guildId ?? undefined,
        channelId: message.channelId,
        messageId: message.id,
        matchedValue,
        contentPreview: normalizeMessageText(message.content).slice(0, 160),
        createdAt: new Date().toISOString(),
        ...extra,
      },
    };
  }

  private getEnforcedStatus(
    _createdTimestamp: number,
    _settings: MahoragaDetectionSettings,
  ): MahoragaCaseStatus {
    return MahoragaCaseStatus.Active;
  }

  private async shouldIgnoreMessage(message: Message): Promise<boolean> {
    if (message.author.bot) return true;
    if (message.webhookId) return true;
    if (!message.guild || !message.guildId) return true;

    const enabled = await this.guildSettings.getSetting<boolean>(
      message.guildId,
      GuildSettings.MahoragaEnabled,
      false,
    );
    if (!enabled) return true;

    const member =
      message.member ??
      (await message.guild.members.fetch(message.author.id).catch(() => null));
    if (!member) return true;

    return (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild)
    );
  }

  private async getDetectionSettings(
    guildId: string,
  ): Promise<MahoragaDetectionSettings> {
    return {
      textRepeatLimit: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaTextRepeatLimit,
        TEXT_REPEAT_LIMIT,
      ),
      textWindowSeconds: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaTextWindowSeconds,
        TEXT_WINDOW_SECONDS,
      ),
      linkRepeatLimit: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaLinkRepeatLimit,
        LINK_REPEAT_LIMIT,
      ),
      linkWindowSeconds: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaLinkWindowSeconds,
        LINK_WINDOW_SECONDS,
      ),
      imageRepeatLimit: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaImageRepeatLimit,
        IMAGE_REPEAT_LIMIT,
      ),
      imageWindowSeconds: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaImageWindowSeconds,
        IMAGE_WINDOW_SECONDS,
      ),
      messageTrackingWindowSeconds: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaMessageTrackingWindowSeconds,
        MESSAGE_TRACKING_WINDOW_SECONDS,
      ),
      youngAccountMonths: await this.getNumberSetting(
        guildId,
        GuildSettings.MahoragaYoungAccountMonths,
        YOUNG_ACCOUNT_MONTHS,
      ),
      honeypotMode: await this.getModeSetting(
        guildId,
        GuildSettings.MahoragaHoneypotMode,
        MahoragaDetectionMode.On,
      ),
      repeatMode: await this.getModeSetting(
        guildId,
        GuildSettings.MahoragaRepeatMode,
        MahoragaDetectionMode.On,
      ),
      youngAccountMode: await this.getModeSetting(
        guildId,
        GuildSettings.MahoragaYoungAccountMode,
        MahoragaDetectionMode.On,
      ),
    };
  }

  private async getNumberSetting(
    guildId: string,
    key: GuildSettings,
    fallback: number,
  ): Promise<number> {
    const value = await this.guildSettings.getSetting<number>(
      guildId,
      key,
      fallback,
    );
    if (!value || value < 1) return fallback;
    return value;
  }

  private async getModeSetting(
    guildId: string,
    key: GuildSettings,
    fallback: MahoragaDetectionMode,
  ): Promise<MahoragaDetectionMode> {
    const value = await this.guildSettings.getSetting<string>(
      guildId,
      key,
      fallback,
    );
    if (value === MahoragaDetectionMode.Off) return MahoragaDetectionMode.Off;
    if (value === MahoragaDetectionMode.Monitor)
      return MahoragaDetectionMode.Monitor;
    return MahoragaDetectionMode.On;
  }

  private getDetectorMode(
    settings: MahoragaDetectionSettings,
    reason: MahoragaReason,
  ): MahoragaDetectionMode {
    switch (reason) {
      case MahoragaReason.Honeypot:
        return settings.honeypotMode;
      case MahoragaReason.TextRepeat:
      case MahoragaReason.LinkRepeat:
      case MahoragaReason.ImageRepeat:
        return settings.repeatMode;
      default:
        return MahoragaDetectionMode.On;
    }
  }

  private async hitDetector(
    kind: 'text' | 'link' | 'image',
    guildId: string,
    userId: string,
    value: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const key = `mahoraga:detector:${kind}:${guildId}:${userId}:${hashValue(
      value,
    )}`;
    return hitFixedWindowThreshold(this.redis, key, limit, windowSeconds);
  }

  private async trackMessage(
    guildId: string,
    userId: string,
    channelId: string,
    messageId: string,
    windowSeconds: number,
  ): Promise<void> {
    if (windowSeconds < 1) return;
    const key = `mahoraga:messages:${guildId}:${userId}`;
    await this.redis.sadd(key, `${channelId}:${messageId}`);
    await this.redis.expire(key, windowSeconds);
  }

  async getTrackedMessages(
    guildId: string,
    userId: string,
  ): Promise<Array<{ channelId: string; messageId: string }>> {
    const entries = await this.redis.smembers(
      `mahoraga:messages:${guildId}:${userId}`,
    );
    return entries.map((entry) => {
      const [channelId, messageId] = entry.split(':');
      return { channelId, messageId };
    });
  }

  async clearTrackedMessages(guildId: string, userId: string): Promise<void> {
    await this.redis.del(`mahoraga:messages:${guildId}:${userId}`);
  }

  private async getImageAttachmentHash(
    attachment: Attachment,
  ): Promise<string | null> {
    if (!isImageAttachment(attachment)) return null;

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) return null;

      const contentLength = Number(response.headers.get('content-length') ?? 0);
      if (contentLength > MAX_IMAGE_BYTES) return null;

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

      return hashArrayBuffer(buffer);
    } catch (error) {
      this.logger.warn(
        `Could not hash image attachment ${attachment.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
