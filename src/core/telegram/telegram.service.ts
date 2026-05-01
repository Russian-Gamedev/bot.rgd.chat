import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import type { Context, Telegraf } from 'telegraf';

import { EnvironmentVariables } from '#config/env';

@Injectable()
export class TelegramService {
  constructor(
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private readonly config: ConfigService<EnvironmentVariables>,
  ) {}

  getAvatarProxyUrl(chatId: string) {
    const baseUrl = this.config.getOrThrow<string>('BASE_URL');
    const url = new URL(`/telegram/avatar/${chatId}`, baseUrl);

    return url.toString();
  }

  async fetchChatAvatar(chatId: string) {
    const chat = await this.bot.telegram.getChat(chatId).catch(() => null);
    const photo = chat?.photo;
    if (!photo?.big_file_id) {
      throw new NotFoundException('Telegram chat avatar not found');
    }

    const fileUrl = await this.bot.telegram.getFileLink(photo.small_file_id);

    const url = this.bot.telegram.options.apiRoot + fileUrl.pathname;

    const response = await fetch(url);
    if (!response.ok) {
      throw new NotFoundException('Telegram chat avatar not found');
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    return {
      contentType,
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  }
}
