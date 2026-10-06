import { randomInt } from 'node:crypto';
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
  StringOption,
} from 'necord';
import { Colors } from '#config/constants';
import { Emojis } from '#config/emojis';
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
  rouletteButtonRoute,
} from '#core/mini-games/mini-games.ui';
import type { MemberProfileEntity } from '#core/users/entities/member-profile.entity';
import { UserService } from '#core/users/users.service';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import { cast, formatCoins } from '#lib/utils';
import type { DiscordID } from '#root/lib/types';
import type { RouletteColor } from './roulette.types';
import {
  pocketColor,
  ROULETTE_EMOJI,
  ROULETTE_LABELS,
  ROULETTE_PAYOUTS,
  resolveFinalFrame,
  rollPocket,
  settleBet,
  spinFrame,
} from './roulette.utils';

/** Growing pauses between ticks — the wheel decelerates like a real one. */
const TICK_DELAYS_MS = [500, 600, 700, 850, 1_000, 1_200];
const MAX_TICK_STEP = 3;

class RouletteGameDto {
  @IntegerOption({
    name: 'coins',
    description: 'Количество монет для ставки',
    required: true,
    min_value: MIN_BET,
    max_value: MAX_BET,
  })
  coins: number;

  @StringOption({
    name: 'color',
    description: 'Цвет ставки',
    required: true,
    choices: (Object.keys(ROULETTE_LABELS) as RouletteColor[]).map((color) => ({
      name: `${ROULETTE_EMOJI[color]} ${ROULETTE_LABELS[color]} — ×${ROULETTE_PAYOUTS[color]}`,
      value: color,
    })),
  })
  color: RouletteColor;
}

@Injectable()
export class RouletteGame {
  private readonly logger = new Logger(RouletteGame.name);

  constructor(
    private readonly userService: UserService,
    private readonly miniGames: MiniGameService,
  ) {}

  @SlashCommand({
    name: 'roulette',
    description: 'Spin the roulette wheel',
  })
  async play(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: RouletteGameDto,
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
        dto.color,
      );
    } catch (error) {
      await this.replyError(interaction, error);
    }
  }

  @Button(rouletteButtonRoute())
  async replay(@Context() [interaction]: ButtonContext) {
    const payload = parseRoundButtons(interaction.customId);
    if (!payload?.pick || payload.userId !== interaction.user.id) {
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
    if (this.miniGames.isPlaying(MiniGame.ROULETTE, payload.userId)) {
      return interaction.reply({
        content: 'Вы уже играете! Дождитесь окончания.',
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
      await this.round(
        messenger,
        interaction.guild.id,
        member,
        user,
        bet,
        payload.pick,
      );
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
    color: RouletteColor,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🎡 Рулетка')
      .setColor(Colors.Primary)
      .setAuthor({
        name: member.displayName,
        iconURL: member.displayAvatarURL(),
      });

    let rolled: RouletteColor | null = null;
    let finalGrid = '';

    const spin = async (): Promise<MiniGameOutcome> => {
      await messenger.ack();

      let ringOffset = randomInt(16);
      let arrowIndex = randomInt(8);
      await messenger.edit({
        embeds: [embed.setDescription(spinFrame(ringOffset, arrowIndex))],
      });

      // cosmetic spinning ticks, the wheel decelerates towards the end
      for (const delay of TICK_DELAYS_MS) {
        await Bun.sleep(delay);
        ringOffset = (ringOffset + randomInt(1, MAX_TICK_STEP + 1)) % 16;
        arrowIndex = (arrowIndex + 1) % 8;
        await messenger.edit({
          embeds: [embed.setDescription(spinFrame(ringOffset, arrowIndex))],
        });
      }

      const pocket = rollPocket();
      rolled = pocketColor(pocket);
      const final = resolveFinalFrame(rolled, ringOffset, arrowIndex);
      finalGrid = final.grid;
      await messenger.edit({ embeds: [embed.setDescription(finalGrid)] });

      const { payout } = settleBet(color, rolled, bet);
      return {
        payout,
        details: {
          pocket,
          color: rolled,
          pick: color,
          multiplier: payout > 0n ? Number(ROULETTE_PAYOUTS[rolled]) : 0,
        },
      };
    };

    const result: MiniGameResult = await this.miniGames.play(
      {
        game: MiniGame.ROULETTE,
        guildId,
        userId: user.user_id,
        bet,
      },
      spin,
    );

    const rolledColor = cast<RouletteColor>(rolled);

    const outcome = result.won
      ? `🎲 Выпало ${ROULETTE_EMOJI[rolledColor]} **${ROULETTE_LABELS[rolledColor]}** — вы выиграли ${formatCoins(result.payout)} монет! 🎉`
      : `🎲 Выпало ${ROULETTE_EMOJI[rolledColor]} **${ROULETTE_LABELS[rolledColor]}**. К сожалению, вы проиграли.`;

    embed.setDescription(
      `${finalGrid}\n\n${outcome}\n__Ставка:__ ${formatCoins(result.bet)} ${Emojis.CoinTop}\n__Баланс:__ ~~${formatCoins(result.balanceBefore)}~~ -> ${formatCoins(result.balanceAfter)} ${Emojis.CoinBottom}`,
    );
    embed.setColor(result.won ? '#5fdb00' : '#ff2f00');

    await messenger.edit({
      content: `<@${user.user_id}>`,
      embeds: [embed],
      components: buildRoundButtons(
        MiniGame.ROULETTE,
        user.user_id,
        bet,
        color,
      ),
    });
  }

  private async replyError(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    error: unknown,
  ) {
    let content: string;
    if (error instanceof MiniGameAlreadyPlayingException) {
      content = 'Вы уже играете! Дождитесь окончания.';
    } else if (error instanceof InsufficientFundsException) {
      content = 'У вас недостаточно монет для этой игры. ||бомжара||';
    } else {
      this.logger.error('Roulette round failed, bet refunded', error);
      content = 'Что-то пошло не так, ваша ставка возвращена.';
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}
