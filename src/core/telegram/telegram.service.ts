import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import type { Context, Telegraf } from 'telegraf';

import { EnvironmentVariables } from '#config/env';

import {
  TelegramHttpError,
  TelegramHttpService,
} from './telegram-http.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private readonly config: ConfigService<EnvironmentVariables>,
    private readonly http: TelegramHttpService,
  ) {
    bot.catch((err) => {
      this.logger.error('Telegram bot error:', err);
    });
  }

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

    try {
      return await this.http.fetchBinary(url);
    } catch (error) {
      if (error instanceof TelegramHttpError) {
        throw new NotFoundException('Telegram chat avatar not found');
      }

      throw error;
    }
  }
}
