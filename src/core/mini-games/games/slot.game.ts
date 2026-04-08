import { Injectable } from '@nestjs/common';
import { Client, EmbedBuilder } from 'discord.js';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
  StringOption,
} from 'necord';

import { Colors } from '#config/constants';
import { EmojiCoin } from '#config/emojies';
import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import { DiscordID } from '#root/lib/types';
import { formatCoins } from '#root/lib/utils';

const SYMBOLS = ['🍒', '🍋', '💎', '7️⃣', '⭐', '🔔', '🍀'];
const PAYOUTS: Record<string, number> = {
  '🍒🍒🍒': 50,
  '🍋🍋🍋': 100,
  '🔔🔔🔔': 150,
  '💎💎💎': 250,
  '⭐⭐⭐': 300,
  '🍀🍀🍀': 500,
  '7️⃣7️⃣7️⃣': 1000,
};

const HIDDEN_SYMBOL = '❓';

class SlotGameDto {
  @StringOption({
    name: 'coins',
    description: 'Number of coins to bet',
    required: true,
  })
  coins: string;
}

@Injectable()
export class SlotGame {
  private spinning = new Set<DiscordID>();

  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly discord: Client,
  ) {}

  @SlashCommand({
    name: 'slot',
    description: 'Play the slot machine',
  })
  async play(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SlotGameDto,
  ) {
    if (!interaction.guild) return;

    const userId = interaction.user.id as DiscordID;
    if (this.spinning.has(userId)) {
      return interaction.reply({
        content: 'Вы уже крутите слот-машину!',
        ephemeral: true,
      });
    }
    this.spinning.add(userId);

    setTimeout(() => {
      /// safety to prevent stuck state
      this.spinning.delete(userId);
    }, 10_000);

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.user.bot) return;

    const user = await this.userService.findOrCreate(
      interaction.guild?.id,
      interaction.user.id,
    );

    const coins = BigInt(parseInt(dto.coins, 10) || 10);
    if (coins <= 0n) {
      return interaction.reply({
        content: 'Пожалуйста, введите допустимое количество монет для ставки.',
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

    const embed = new EmbedBuilder()
      .setTitle('🎰 Слот машина 🎰')
      .setColor(Colors.Primary)
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      });

    const TOTAL_REELS = 3;

    const data = Array.from({ length: TOTAL_REELS }, () =>
      Array.from(
        { length: 20 },
        () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      ),
    );
    // prepare visible 3x3 symbols for each reel
    const pickVisible = (reel: string[]) => {
      const len = reel.length;
      const center = Math.floor(Math.random() * len);
      return [
        reel[(center - 1 + len) % len], // top
        reel[center], // center
        reel[(center + 1) % len], // bottom
      ];
    };

    const visible = data.map(pickVisible);

    // helper to format a 3x3 grid given which columns are revealed
    const formatGrid = (revealed: boolean[]) => {
      const rows = [0, 1, 2].map((r) =>
        visible
          .map((col, c) => (revealed[c] ? col[r] : HIDDEN_SYMBOL))
          .join(' | '),
      );
      return rows.join('\n');
    };

    const reels = [false, false, false];
    await interaction.deferReply();

    while (reels.some((r) => r === false)) {
      const idx = reels.indexOf(false);
      embed.setDescription(formatGrid(reels));

      await interaction.editReply({ embeds: [embed] });

      reels[idx] = true;
      await Bun.sleep(1000);
    }
    embed.setDescription(formatGrid(reels));
    await interaction.editReply({ embeds: [embed] });
    await Bun.sleep(1000);

    // mark top (line 1) and bottom (line 3) rows as spoilers
    let outputMessage = '';
    const fullGrid = formatGrid(reels);
    const rows = fullGrid.split('\n');
    if (rows.length >= 3) {
      rows[0] = `||${rows[0]}||`;
      rows[2] = `||${rows[2]}||`;
    }

    outputMessage += rows.join('\n') + '\n\n';
    const finalSymbols = visible.map((col) => col[1]); // middle row across reels

    const resultKey = finalSymbols.join('');
    let isWin = false;
    if (PAYOUTS[resultKey]) {
      isWin = true;
      const winnings = coins * BigInt(PAYOUTS[resultKey]);
      await this.walletService.credit(user, winnings, 'mini-game:slot');
      outputMessage += `🎉 Вы выиграли ${formatCoins(winnings)} монет! 🎉`;
    } else {
      await this.walletService.debit(user, coins, 'mini-game:slot');
      outputMessage += `К сожалению, вы проиграли.`;
    }

    outputMessage += `\n__Ставка:__ ${formatCoins(coins)} ${EmojiCoin.Top}\n__Баланс:__ ~~${formatCoins(oldBalance)}~~ -> ${formatCoins(user.coins)} ${EmojiCoin.Bottom}`;

    embed.setColor(isWin ? '#5fdb00' : '#ff2f00');
    embed.setDescription(outputMessage);
    await interaction.editReply({ embeds: [embed], content: `<@${userId}>` });

    this.spinning.delete(userId);
  }
}
