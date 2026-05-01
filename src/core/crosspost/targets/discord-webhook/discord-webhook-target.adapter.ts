import { BadRequestException, Injectable } from '@nestjs/common';
import crypto from 'crypto';

import type {
  CrossPostEvent,
  CrossPostTarget,
  CrossPostTargetAdapter,
} from '../../types/crosspost.types';
import { CrossPostTargetKind } from '../../types/crosspost.types';

import { DiscordWebhookPublisher } from './discord-webhook-publisher.service';

const DISCORD_WEBHOOK_URL_PATTERN =
  /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/;

export interface DiscordWebhookTarget extends CrossPostTarget {
  kind: CrossPostTargetKind.DiscordWebhook;
  webhookUrl: string;
}

@Injectable()
export class DiscordWebhookTargetAdapter
  implements CrossPostTargetAdapter<DiscordWebhookTarget>
{
  readonly kind = CrossPostTargetKind.DiscordWebhook;

  constructor(private readonly publisher: DiscordWebhookPublisher) {}

  normalizeTarget(target: Partial<CrossPostTarget>): DiscordWebhookTarget {
    const webhookUrl =
      typeof target.webhookUrl === 'string' ? target.webhookUrl : '';
    if (!DISCORD_WEBHOOK_URL_PATTERN.test(webhookUrl)) {
      throw new BadRequestException('Invalid Discord webhook URL');
    }

    return {
      id: target.id ? String(target.id) : crypto.randomUUID(),
      kind: CrossPostTargetKind.DiscordWebhook,
      webhookUrl,
      enabled: target.enabled ?? true,
    };
  }

  async create(target: DiscordWebhookTarget, event: CrossPostEvent) {
    const message = await this.publisher.createMessage(
      target.webhookUrl,
      event,
    );
    return message.id;
  }

  async edit(
    target: DiscordWebhookTarget,
    targetMessageId: string,
    event: CrossPostEvent,
  ) {
    await this.publisher.editMessage(target.webhookUrl, targetMessageId, event);
  }

  async delete(target: DiscordWebhookTarget, targetMessageId: string) {
    await this.publisher.deleteMessage(target.webhookUrl, targetMessageId);
  }
}
