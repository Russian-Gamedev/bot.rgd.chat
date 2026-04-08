import { Injectable } from '@nestjs/common';
import { Client, EmbedBuilder } from 'discord.js';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
  StringOption,
} from 'necord';

import { EmojiCoin, EmojiCoinId } from '#config/emojies';
import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import { DiscordID } from '#root/lib/types';
import { formatCoins } from '#root/lib/utils';

class FlipGameDto {
  @StringOption({
    name: 'coins',
    description: 'Number of coins to flip',
    required: true,
  })
  coins: string;
}

@Injectable()
export class FlipGame {
  private flipping = new Set<DiscordID>();

  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly discord: Client,
  ) {}

  @SlashCommand({
    name: 'flip',
    description: 'Flip a coin',
  })
  async play(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: FlipGameDto,
  ) {
    if (!interaction.guild) return;

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.user.bot) return;

    const user = await this.userService.findOrCreate(
      interaction.guild?.id,
      interaction.user.id,
    );

    if (this.flipping.has(interaction.user.id)) {
      return interaction.reply({
        content:
          'Вы уже играете в эту игру. Пожалуйста, дождитесь окончания текущей игры.',
        ephemeral: true,
      });
    }

    const coins = BigInt(parseInt(dto.coins, 10) || 0);
    if (coins <= 0n) {
      return interaction.reply({
        content: 'Введите корректное количество монет.',
        ephemeral: true,
      });
    }

    if (user.coins < coins) {
      return interaction.reply({
        content: 'У вас недостаточно монет для этой игры. ||бомжара||',
        ephemeral: true,
      });
    }

    const oldBalance = user.coins;

    this.flipping.add(interaction.user.id);

    const description = `**ПОДБРАСЫВАЕМ...**\n__Ставка:__ ${formatCoins(coins)} ${EmojiCoin.Top}\n__Баланс:__ ${formatCoins(user.coins)} ${EmojiCoin.Bottom}`;

    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setAuthor({
        name: member.displayName,
        iconURL: member.displayAvatarURL(),
      })
      .setThumbnail(
        `https://cdn.discordapp.com/emojis/${EmojiCoinId.Animated}.webp?size=64&animated=true`,
      )
      .setDescription(description);

    await interaction.reply({ embeds: [embed] });

    await Bun.sleep(3_000);

    const isWin = Math.floor(Math.random() * 100) % 2;
    if (isWin) {
      await this.walletService.credit(user, coins, 'mini-game:flip');
    } else {
      await this.walletService.debit(user, coins, 'mini-game:flip');
    }

    this.flipping.delete(interaction.user.id);

    embed.setDescription(
      `**${isWin ? 'ПОБЕДА' : 'ПОСАСАКА'}**\n__Ставка:__ ${formatCoins(coins)} ${EmojiCoin.Top}\n__Баланс:__ ~~${formatCoins(oldBalance)}~~ -> ${formatCoins(user.coins)} ${EmojiCoin.Bottom}`,
    );
    embed.setThumbnail(
      isWin
        ? `https://cdn.discordapp.com/emojis/${EmojiCoinId.Bottom}.webp?size=64&animated=true`
        : `https://cdn.discordapp.com/emojis/${EmojiCoinId.Top}.webp?size=64&animated=true`,
    );
    embed.setColor(isWin ? '#5fdb00' : '#ff2f00');

    await interaction.editReply({ embeds: [embed] });
  }
}
