import { BadRequestException, Injectable } from '@nestjs/common';

import type {
  CrossPostSourceAdapter,
  CrossPostSourceConfig,
} from '../../types/crosspost.types';
import { CrossPostSourceKind } from '../../types/crosspost.types';

export interface DiscordChannelSourceConfig extends CrossPostSourceConfig {
  guildId: string;
  channelId: string;
}

@Injectable()
export class DiscordSourceAdapter
  implements CrossPostSourceAdapter<DiscordChannelSourceConfig>
{
  readonly kind = CrossPostSourceKind.DiscordChannel;

  normalizeConfig(config: CrossPostSourceConfig): DiscordChannelSourceConfig {
    const source = config as Partial<DiscordChannelSourceConfig>;
    if (!source.guildId || !source.channelId) {
      throw new BadRequestException(
        'Discord source requires guildId and channelId',
      );
    }

    return {
      guildId: String(source.guildId),
      channelId: String(source.channelId),
    };
  }

  buildSourceKey(config: DiscordChannelSourceConfig) {
    return `discord:channel:${config.channelId}`;
  }
}
