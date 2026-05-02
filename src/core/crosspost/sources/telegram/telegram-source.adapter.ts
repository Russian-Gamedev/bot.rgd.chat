import { BadRequestException, Injectable } from '@nestjs/common';

import type {
  CrossPostSourceAdapter,
  CrossPostSourceConfig,
} from '../../types/crosspost.types';
import { CrossPostSourceKind } from '../../types/crosspost.types';

export interface TelegramChannelSourceConfig extends CrossPostSourceConfig {
  chatId: string;
  chatTitle?: string;
  username?: string;
  printFooter: boolean;
  footerTemplate?: string;
  onlyWithLinks: boolean;
}

@Injectable()
export class TelegramSourceAdapter
  implements CrossPostSourceAdapter<TelegramChannelSourceConfig>
{
  readonly kind = CrossPostSourceKind.TelegramChannel;

  normalizeConfig(config: CrossPostSourceConfig): TelegramChannelSourceConfig {
    const source = config as Partial<TelegramChannelSourceConfig>;
    if (!source.chatId) {
      throw new BadRequestException('Telegram source requires chatId');
    }

    return {
      chatId: String(source.chatId),
      chatTitle: source.chatTitle ? String(source.chatTitle) : undefined,
      username: this.normalizeUsername(source.username),
      printFooter: source.printFooter === true,
      footerTemplate: source.footerTemplate
        ? String(source.footerTemplate)
        : undefined,
      onlyWithLinks: source.onlyWithLinks === true,
    };
  }

  buildSourceKey(config: TelegramChannelSourceConfig) {
    return `telegram:chat:${config.chatId}`;
  }

  private normalizeUsername(username: unknown) {
    if (typeof username !== 'string') return undefined;

    const normalized = username.trim().replace(/^@+/, '');
    return normalized.length > 0 ? normalized : undefined;
  }
}
