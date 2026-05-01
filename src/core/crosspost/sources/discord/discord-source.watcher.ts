import { Injectable } from '@nestjs/common';
import {
  Attachment,
  Message,
  PartialMessage,
  type Snowflake,
} from 'discord.js';
import { Context, type ContextOf, On } from 'necord';

import { CrossPostRelayService } from '../../core/crosspost-relay.service';
import type { CrossPostEvent } from '../../types/crosspost.types';
import { CrossPostSourceKind } from '../../types/crosspost.types';

import { DiscordSourceAdapter } from './discord-source.adapter';

@Injectable()
export class DiscordSourceWatcher {
  constructor(
    private readonly relayService: CrossPostRelayService,
    private readonly sourceAdapter: DiscordSourceAdapter,
  ) {}

  @On('messageCreate')
  async onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>) {
    const event = this.buildMessageEvent('create', message);
    if (!event) return;

    await this.relayService.relay(event);
  }

  @On('messageUpdate')
  async onMessageUpdate(@Context() [, next]: ContextOf<'messageUpdate'>) {
    const message = await next.fetch().catch(() => null);
    if (!message) return;

    const event = this.buildMessageEvent('edit', message);
    if (!event) return;

    await this.relayService.relay(event);
  }

  @On('messageDelete')
  async onMessageDelete(@Context() [message]: ContextOf<'messageDelete'>) {
    if (!message.guildId || !message.channelId) return;

    await this.relayService.relay({
      kind: 'delete',
      sourceKind: CrossPostSourceKind.DiscordChannel,
      sourceKey: this.sourceAdapter.buildSourceKey({
        guildId: message.guildId,
        channelId: message.channelId,
      }),
      sourceMessageId: message.id,
      text: '',
      attachmentUrls: [],
      authorName: 'Discord',
    });
  }

  private buildMessageEvent(
    kind: 'create' | 'edit',
    message: Message | PartialMessage,
  ): CrossPostEvent | null {
    if (!message.guildId || !message.channelId) return null;
    if (!('author' in message) || !message.author) return null;
    if (message.author.bot) return null;
    if (message.webhookId) return null;
    if (message.system) return null;

    return {
      kind,
      sourceKind: CrossPostSourceKind.DiscordChannel,
      sourceKey: this.sourceAdapter.buildSourceKey({
        guildId: message.guildId,
        channelId: message.channelId,
      }),
      sourceMessageId: message.id,
      text: message.content ?? '',
      attachmentUrls: this.getAttachmentUrls(message.attachments),
      authorName: message.member?.displayName ?? message.author.username,
      authorAvatarUrl: message.author.displayAvatarURL({
        extension: 'png',
        size: 128,
      }),
    };
  }

  private getAttachmentUrls(attachments: Map<Snowflake, Attachment>) {
    return [...attachments.values()].map((attachment) => attachment.url);
  }
}
