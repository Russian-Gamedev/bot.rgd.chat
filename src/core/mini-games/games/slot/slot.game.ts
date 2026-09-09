import { Injectable, Logger } from '@nestjs/common';
import type { GuildMember } from 'discord.js';
import {
  ButtonInteraction,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import {
  Button,
  type ButtonContext,
  Context,
  IntegerOption,
  Options,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';
import { Colors } from '#config/constants';
import { EmojiCoin, EmojiSlots } from '#config/emojies';
import { MiniGame } from '#core/mini-games/entities/mini-game-round.entity';
import { MiniGameAlreadyPlayingException } from '#core/mini-games/mini-game.exception';
import { MiniGameService } from '#core/mini-games/mini-game.service';
import type {
  MiniGameOutcome,
  MiniGameResult,
} from '#core/mini-games/mini-game.types';
import { MAX_BET, MIN_BET } from '#core/mini-games/mini-games.constants';
import {
  buildRoundButtons,
  parseRoundButtons,
  type RoundMessenger,
  resolveRoundBet,
  roundButtonRoute,
} from '#core/mini-games/mini-games.ui';
import type { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { UserService } from '#core/users/users.service';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import { choose, formatCoins } from '#lib/utils';
import type { DiscordID } from '#root/lib/types';

/**
 * Weighted reel strip: cheap symbols occupy more cells than premium ones,
 * so triples of 🍒 are common and triples of 7️⃣ are rare.
 */
const REEL = [
  '🍒',
  '🍒',
  '🍒',
  '🍒',
  '🍒',
  '🍋',
  '🍋',
  '🍋',
  '🍋',
  '🔔',
  '🔔',
  '🔔',
  '💎',
  '💎',
  '⭐',
  '⭐',
  '🍀',
  '7️⃣',
] as const;

/**
 * Net payout multiplier of the bet for one line of three identical symbols.
 * Eight lines are checked (3 rows, 3 columns, 2 diagonals) and winnings
 * from several lines sum up. Symbols come from the 18-cell REEL strip,
 * so the house edge is 1 - 8 * Σ (w/18)³ * payout = 1 - 5520/5832 ≈ 5.3%.
 */
const PAYOUTS: Record<string, number> = {
  '🍒': 2,
  '🍋': 2,
  '🔔': 4,
  '💎': 8,
  '⭐': 10,
  '🍀': 20,
  '7️⃣': 40,
};

/** Paying lines on the 3x3 grid, cells are [row, col]. */
const LINES: Array<{ name: string; cells: Array<[number, number]> }> = [
  {
    name: 'верхняя строка',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
  },
  {
    name: 'средняя строка',
    cells: [
      [1, 0],
      [1, 1],
      [1, 2],
    ],
  },
  {
    name: 'нижняя строка',
    cells: [
      [2, 0],
      [2, 1],
      [2, 2],
    ],
  },
  {
    name: 'левый столбец',
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
  },
  {
    name: 'средний столбец',
    cells: [
      [0, 1],
      [1, 1],
      [2, 1],
    ],
  },
  {
    name: 'правый столбец',
    cells: [
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  },
  {
    name: 'диагональ ↘',
    cells: [
      [0, 0],
      [1, 1],
      [2, 2],
    ],
  },
  {
    name: 'диагональ ↗',
    cells: [
      [0, 2],
      [1, 1],
      [2, 0],
    ],
  },
];

const HIDDEN_SYMBOL = EmojiSlots.Void;
const TOTAL_REELS = 3;
const REEL_SPIN_MS = 1_000;

class SlotGameDto {
  @IntegerOption({
    name: 'coins',
    description: 'Количество монет для ставки',
    required: true,
    min_value: MIN_BET,
    max_value: MAX_BET,
  })
  coins: number;
}

@Injectable()
export class SlotGame {
  private readonly logger = new Logger(SlotGame.name);

  constructor(
    private readonly userService: UserService,
    private readonly miniGames: MiniGameService,
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

    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.user.bot) return;

    const user = await this.userService.findOrCreate(
      interaction.guild.id,
      interaction.user.id,
    );

    const messenger: RoundMessenger = {
      ack: () => interaction.deferReply(),
      edit: (payload) => interaction.editReply(payload),
    };

    try {
      await this.round(
        messenger,
        interaction.guild.id,
        member,
        user,
        BigInt(dto.coins),
      );
    } catch (error) {
      await this.replyError(interaction, error);
    }
  }

  @Button(roundButtonRoute(MiniGame.SLOT))
  async replay(@Context() [interaction]: ButtonContext) {
    const payload = parseRoundButtons(interaction.customId);
    if (!payload || payload.userId !== interaction.user.id) {
      return interaction.reply({
        content: 'Эта партия не ваша 🙂',
        flags: MessageFlags.Ephemeral,
      });
    }

    const bet = resolveRoundBet(payload.action, payload.bet);
    if (bet < BigInt(MIN_BET) || bet > BigInt(MAX_BET)) {
      return interaction.reply({
        content: `Ставка должна быть от ${formatCoins(MIN_BET)} до ${formatCoins(MAX_BET)} монет.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (this.miniGames.isPlaying(MiniGame.SLOT, payload.userId)) {
      return interaction.reply({
        content: 'Вы уже крутите слот-машину! Дождитесь окончания.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!interaction.guild) return;

    await interaction.deferUpdate();

    const member = await interaction.guild.members.fetch(payload.userId);
    const user = await this.userService.findOrCreate(
      interaction.guild.id,
      payload.userId,
    );

    // the interaction is already acknowledged, edits go to the same message
    const messenger: RoundMessenger = {
      ack: async () => {},
      edit: (p) => interaction.editReply(p),
    };

    try {
      await this.round(messenger, interaction.guild.id, member, user, bet);
    } catch (error) {
      await this.replyError(interaction, error);
    }
  }

  private async round(
    messenger: RoundMessenger,
    guildId: DiscordID,
    member: GuildMember,
    user: MemberProfileEntity,
    bet: bigint,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle(`${EmojiSlots.Slots} Слот машина ${EmojiSlots.Slots}`)
      .setColor(Colors.Primary)
      .setAuthor({
        name: member.displayName,
        iconURL: member.displayAvatarURL(),
      });

    // grid[col][row]: columns are revealed one by one during the animation
    let grid: string[][] = [];
    let winning: Array<{ name: string; symbol: string; multiplier: number }> =
      [];

    const spin = async (): Promise<MiniGameOutcome> => {
      await messenger.ack();

      grid = Array.from({ length: TOTAL_REELS }, () => [
        choose(REEL),
        choose(REEL),
        choose(REEL),
      ]);

      const formatGrid = (revealed: boolean[]) =>
        [0, 1, 2]
          .map((row) =>
            grid
              .map((col, c) => (revealed[c] ? col[row] : HIDDEN_SYMBOL))
              .join(' | '),
          )
          .join('\n');

      const revealed = [false, false, false];
      while (revealed.some((r) => r === false)) {
        embed.setDescription(formatGrid(revealed));
        await messenger.edit({ embeds: [embed] });

        revealed[revealed.indexOf(false)] = true;
        await Bun.sleep(REEL_SPIN_MS);
      }
      embed.setDescription(formatGrid(revealed));
      await messenger.edit({ embeds: [embed] });
      await Bun.sleep(REEL_SPIN_MS);

      const at = (row: number, col: number) => grid[col][row];
      winning = LINES.flatMap(({ name, cells }) => {
        const symbols = cells.map(([row, col]) => at(row, col));
        return symbols.every((s) => s === symbols[0])
          ? [{ name, symbol: symbols[0], multiplier: PAYOUTS[symbols[0]] }]
          : [];
      });
      const multiplier = winning.reduce(
        (sum, line) => sum + line.multiplier,
        0,
      );

      return {
        payout: BigInt(multiplier) * bet,
        details: {
          grid: [0, 1, 2].map((row) => [0, 1, 2].map((col) => at(row, col))),
          multiplier,
          lines: winning.map((line) => line.name),
        },
      };
    };

    const result: MiniGameResult = await this.miniGames.play(
      {
        game: MiniGame.SLOT,
        guildId,
        userId: user.user_id,
        bet,
      },
      spin,
    );

    const gridText = [0, 1, 2]
      .map((row) => grid.map((col) => col[row]).join(' | '))
      .join('\n');

    const linesText = winning
      .map((line) => `${line.name} ${line.symbol} ×${line.multiplier}`)
      .join(', ');
    const outcome = result.won
      ? `🎉 Вы выиграли ${formatCoins(result.payout)} монет! 🎉\nЛинии: ${linesText}`
      : 'К сожалению, вы проиграли.';

    embed.setDescription(
      `${gridText}\n\n${outcome}\n__Ставка:__ ${formatCoins(result.bet)} ${EmojiCoin.Top}\n__Баланс:__ ~~${formatCoins(result.balanceBefore)}~~ -> ${formatCoins(result.balanceAfter)} ${EmojiCoin.Bottom}`,
    );
    embed.setColor(result.won ? '#5fdb00' : '#ff2f00');

    await messenger.edit({
      content: `<@${user.user_id}>`,
      embeds: [embed],
      components: buildRoundButtons(MiniGame.SLOT, user.user_id, bet),
    });
  }

  private async replyError(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    error: unknown,
  ) {
    let content: string;
    if (error instanceof MiniGameAlreadyPlayingException) {
      content = 'Вы уже крутите слот-машину! Дождитесь окончания.';
    } else if (error instanceof InsufficientFundsException) {
      content = 'У вас недостаточно монет для этой игры. ||бомжара||';
    } else {
      this.logger.error('Slot round failed, bet refunded', error);
      content = 'Что-то пошло не так, ваша ставка возвращена.';
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}
