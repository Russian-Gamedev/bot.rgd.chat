import { Injectable } from '@nestjs/common';
import type { Message } from 'discord.js';

import { fixMessageLinks } from './link-fix';

@Injectable()
export class UtilsService {
  async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || message.webhookId || !message.content) return;

    const links = fixMessageLinks(message.content);
    if (!links) return;

    await message.suppressEmbeds(true);
    await message.reply({
      content: links.join('\n'),
      allowedMentions: { parse: [] },
    });
  }
}
