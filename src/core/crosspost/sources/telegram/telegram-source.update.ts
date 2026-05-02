import { Injectable } from '@nestjs/common';
import { Ctx, On, Update } from 'nestjs-telegraf';
import type { Context } from 'telegraf';

import { TelegramService } from '#core/telegram/telegram.service';

import { CrossPostRelayService } from '../../core/crosspost-relay.service';
import { CrossPostRouteService } from '../../core/crosspost-route.service';
import type { CrossPostEvent } from '../../types/crosspost.types';
import { CrossPostSourceKind } from '../../types/crosspost.types';

import {
  TelegramChannelSourceConfig,
  TelegramSourceAdapter,
} from './telegram-source.adapter';

export interface TelegramMessageEntity {
  type: string;
}

export interface TelegramChannelPost {
  message_id: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
  chat: {
    id: number | string;
    title?: string;
  };
}

type TelegramChannelContext = Context & {
  channelPost?: TelegramChannelPost;
  editedChannelPost?: TelegramChannelPost;
};

type TelegramCrossPostEvent = CrossPostEvent & {
  telegramPost: TelegramChannelPost;
};

@Update()
@Injectable()
export class TelegramSourceUpdate {
  constructor(
    private readonly relayService: CrossPostRelayService,
    private readonly routeService: CrossPostRouteService,
    private readonly telegramService: TelegramService,
    private readonly sourceAdapter: TelegramSourceAdapter,
  ) {}

  @On('channel_post')
  async onChannelPost(@Ctx() ctx: TelegramChannelContext) {
    const event = this.buildEvent('create', ctx.channelPost);
    if (!event) return;

    await this.relay(event);
  }

  @On('edited_channel_post')
  async onEditedChannelPost(@Ctx() ctx: TelegramChannelContext) {
    const event = this.buildEvent('edit', ctx.editedChannelPost);
    if (!event) return;

    await this.relay(event);
  }

  private buildEvent(
    kind: 'create' | 'edit',
    post?: TelegramChannelPost,
  ): TelegramCrossPostEvent | null {
    if (!post) return null;

    const chatId = String(post.chat.id);
    const text = post.text ?? post.caption ?? '';

    return {
      kind,
      sourceKind: CrossPostSourceKind.TelegramChannel,
      sourceKey: this.sourceAdapter.buildSourceKey(
        this.sourceAdapter.normalizeConfig({ chatId }),
      ),
      sourceMessageId: String(post.message_id),
      text,
      attachmentUrls: [],
      authorName: post.chat.title ?? 'Telegram',
      authorAvatarUrl: this.telegramService.getAvatarProxyUrl(chatId),
      telegramPost: post,
    };
  }

  private async relay(event: TelegramCrossPostEvent) {
    const routes = await this.routeService.findEnabledRoutes(
      event.sourceKind,
      event.sourceKey,
    );

    for (const route of routes) {
      const config = this.sourceAdapter.normalizeConfig(route.sourceConfig);
      const text = formatTelegramText(event.text, config);

      if (
        config.onlyWithLinks &&
        !hasTelegramLinks(event.telegramPost, event.text)
      ) {
        continue;
      }

      await this.relayService.relayToRoute(route, {
        kind: event.kind,
        sourceKind: event.sourceKind,
        sourceKey: event.sourceKey,
        sourceMessageId: event.sourceMessageId,
        text,
        attachmentUrls: event.attachmentUrls,
        authorName: event.authorName,
        authorAvatarUrl: event.authorAvatarUrl,
      });
    }
  }
}

export function hasTelegramLinks(post: TelegramChannelPost, text: string) {
  if (/(https?:\/\/|www\.)\S+/i.test(text)) return true;

  const entities = [...(post.entities ?? []), ...(post.caption_entities ?? [])];
  return entities.some(
    (entity) => entity.type === 'url' || entity.type === 'text_link',
  );
}

export function formatTelegramText(
  text: string,
  config: TelegramChannelSourceConfig,
) {
  if (!config.printFooter || !config.username || !config.footerTemplate) {
    return text;
  }

  const footer = config.footerTemplate.replaceAll(
    '%',
    `[@${config.username}](https://t.me/${config.username})`,
  );

  return [text.trim(), footer].filter(Boolean).join('\n\n');
}
