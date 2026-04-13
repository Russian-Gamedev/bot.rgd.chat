import { Injectable } from '@nestjs/common';
import { InteractionContextType, MessageFlags } from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord';

import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import { formatCoins } from '#root/lib/utils';

import { MotdService } from '../motd.service';

import { AddMotdDto } from './motd.dto';

const MOTD_COST = 1000n;

const MotdGroupDecorator = createCommandGroupDecorator({
  name: 'motd',
  description: 'Команды для управления MOTD бота',
  contexts: [InteractionContextType.Guild],
});

@MotdGroupDecorator()
@Injectable()
export class MotdCommands {
  constructor(
    private readonly motdService: MotdService,
    private readonly userService: UserService,
    private readonly walletService: WalletService,
  ) {}

  @Subcommand({
    name: 'add',
    description: `Добавить свой MOTD за ${MOTD_COST} монет`,
  })
  async addMotd(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: AddMotdDto,
  ) {
    const guildId = interaction.guildId;
    if (!guildId) return null;

    const user = await this.userService.findOrCreate(
      guildId,
      interaction.user.id,
    );

    if (user.coins < MOTD_COST) {
      return interaction.reply({
        content: `У вас недостаточно монет. Добавление MOTD стоит ${formatCoins(MOTD_COST)} монет, а у вас ${formatCoins(user.coins)}.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await this.walletService.debit(user, MOTD_COST, 'motd:add');
    await this.motdService.addMotd(dto.content, BigInt(interaction.user.id));

    return interaction.reply({
      content: `✅ Ваш MOTD **«${dto.content}»** добавлен! Списано ${formatCoins(MOTD_COST)} монет.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
