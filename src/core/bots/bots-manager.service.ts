import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Arguments,
  Context,
  TextCommand,
  type TextCommandContext,
} from 'necord';

import { BotsService } from './bots.service';

@Injectable()
export class BotsManagerService {
  constructor(
    private readonly botsService: BotsService,
    private readonly config: ConfigService,
  ) {}

  @TextCommand({
    name: 'createbot',
    description: 'Create a new bot (owner only)',
  })
  async handleMessageCreate(
    @Context() [message]: TextCommandContext,
    @Arguments() args: string[],
  ) {
    if (message.author.bot) return;
    const author = await message.author.fetch();
    if (!this.inWhitelist(author.id)) return;

    const name = args.join(' ');
    if (!name) {
      await message.reply(
        'Please provide a name for the bot. Usage: `!createbot <name>`',
      );
      return;
    }
    const existing = await this.botsService.findByName(name);
    if (existing) {
      await message.reply(
        'A bot with this name already exists. Please choose a different name.',
      );
      return;
    }
    const { access_token } = await this.botsService.createBot(
      name,
      BigInt(author.id),
      [],
    );
    await message.author.send(
      `Bot created successfully! Here is the access token (store it securely, it won't be shown again):\n||\`${access_token}\`||`,
    );
  }

  @TextCommand({
    name: 'deletebot',
    description: 'Delete an existing bot (owner only)',
  })
  async deleteBotCommand(
    @Context() [message]: TextCommandContext,
    @Arguments() args: string[],
  ) {
    if (message.author.bot) return;
    const author = await message.author.fetch();
    if (!this.inWhitelist(author.id)) return;

    const name = args.join(' ');
    if (!name) {
      await message.reply(
        'Please provide the name of the bot to delete. Usage: `!deletebot <bot_name>`',
      );
      return;
    }
    const bot = await this.botsService.findByName(name);
    if (!bot) {
      await message.reply('No bot found with the provided name.');
      return;
    }
    if (bot.ownerId !== BigInt(author.id)) {
      await message.reply('You do not own this bot.');
      return;
    }
    await this.botsService.deleteBot(bot.id);
    await message.reply(`Bot with ID ${bot.id} has been deleted.`);
  }

  private inWhitelist(userId: string): boolean {
    const whitelist = this.config.get<string[]>('API_ACCESS_WHITELIST', []);
    return whitelist.includes(userId);
  }
}
