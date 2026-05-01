import { Injectable } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';

import { TelegramService } from '#core/telegram/telegram.service';

import { CrossPostRelayService } from '../../core/crosspost-relay.service';
import type { CrossPostEvent } from '../../types/crosspost.types';
import { CrossPostSourceKind } from '../../types/crosspost.types';

import { TelegramSourceAdapter } from './telegram-source.adapter';

interface TelegramChannelPost {
  message_id: number;
  text?: string;
  caption?: string;
  chat: {
    id: number | string;
    title?: string;
  };
}

type TelegramChannelContext = Context & {
  channelPost?: TelegramChannelPost;
  editedChannelPost?: TelegramChannelPost;
};

@Update()
@Injectable()
export class TelegramSourceUpdate {
  constructor(
    private readonly relayService: CrossPostRelayService,
    private readonly telegramService: TelegramService,
    private readonly sourceAdapter: TelegramSourceAdapter,
  ) {}

  @On('channel_post')
  async onChannelPost(@Ctx() ctx: TelegramChannelContext) {
    const event = this.buildEvent('create', ctx.channelPost);
    if (!event) return;

    await this.relayService.relay(event);
  }

  @On('edited_channel_post')
  async onEditedChannelPost(@Ctx() ctx: TelegramChannelContext) {
    const event = this.buildEvent('edit', ctx.editedChannelPost);
    if (!event) return;

    await this.relayService.relay(event);
  }

  private buildEvent(
    kind: 'create' | 'edit',
    post?: TelegramChannelPost,
  ): CrossPostEvent | null {
    if (!post) return null;

    const chatId = String(post.chat.id);

    return {
      kind,
      sourceKind: CrossPostSourceKind.TelegramChannel,
      sourceKey: this.sourceAdapter.buildSourceKey({ chatId }),
      sourceMessageId: String(post.message_id),
      text: post.text ?? post.caption ?? '',
      attachmentUrls: [],
      authorName: post.chat.title ?? 'Telegram',
      authorAvatarUrl: this.telegramService.getAvatarProxyUrl(chatId),
    };
  }
}
