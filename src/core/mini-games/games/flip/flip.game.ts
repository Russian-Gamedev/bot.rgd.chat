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
} from 'necord';
import { Emojis } from '#config/emojis';
import { MiniGame } from '#core/mini-games/entities/mini-game-round.entity';
import { MiniGameAlreadyPlayingException } from '#core/mini-games/mini-game.exception';
import { MiniGameService } from '#core/mini-games/mini-game.service';
import type {
  MiniGameOutcome,
  MiniGameResult,
  MiniGameRoundContext,
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
import { formatCoins, getEmojiId } from '#lib/utils';
import type { DiscordID } from '#root/lib/types';

const FLIP_DURATION_MS = 3_000;
/** Win returns double the bet (stake back + equal prize), so EV is exactly 0. */
const WIN_MULTIPLIER = 2n;

class FlipGameDto {
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
export class FlipGame {
  private readonly logger = new Logger(FlipGame.name);

  constructor(
    private readonly userService: UserService,
    private readonly miniGames: MiniGameService,
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

  @Button(roundButtonRoute(MiniGame.FLIP))
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
    if (this.miniGames.isPlaying(MiniGame.FLIP, payload.userId)) {
      return interaction.reply({
        content:
          'Вы уже играете в эту игру. Пожалуйста, дождитесь окончания текущей игры.',
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
      .setColor('#FF9900')
      .setAuthor({
        name: member.displayName,
        iconURL: member.displayAvatarURL(),
      })
      .setThumbnail(
        `https://cdn.discordapp.com/emojis/${getEmojiId(Emojis.CoinAnimated)}.webp?size=64&animated=true`,
      );

    const toss = async ({
      balance,
    }: MiniGameRoundContext): Promise<MiniGameOutcome> => {
      await messenger.ack();

      embed.setDescription(
        `**ПОДБРАСЫВАЕМ...**\n__Ставка:__ ${formatCoins(bet)} ${Emojis.CoinTop}\n__Баланс:__ ${formatCoins(balance)} ${Emojis.CoinBottom}`,
      );
      await messenger.edit({ embeds: [embed] });

      await Bun.sleep(FLIP_DURATION_MS);

      const won = randomInt(2) === 1;
      return { payout: won ? bet * WIN_MULTIPLIER : 0n };
    };

    const result: MiniGameResult = await this.miniGames.play(
      {
        game: MiniGame.FLIP,
        guildId,
        userId: user.user_id,
        bet,
      },
      toss,
    );

    embed.setDescription(
      `**${result.won ? 'ПОБЕДА' : 'ПОСАСАКА'}**\n__Ставка:__ ${formatCoins(result.bet)} ${Emojis.CoinTop}\n__Баланс:__ ~~${formatCoins(result.balanceBefore)}~~ -> ${formatCoins(result.balanceAfter)} ${Emojis.CoinBottom}`,
    );
    embed.setThumbnail(
      `https://cdn.discordapp.com/emojis/${result.won ? getEmojiId(Emojis.CoinBottom) : getEmojiId(Emojis.CoinTop)}.webp?size=64&animated=true`,
    );
    embed.setColor(result.won ? '#5fdb00' : '#ff2f00');

    await messenger.edit({
      embeds: [embed],
      components: buildRoundButtons(MiniGame.FLIP, user.user_id, bet),
    });
  }

  private async replyError(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    error: unknown,
  ) {
    let content: string;
    if (error instanceof MiniGameAlreadyPlayingException) {
      content =
        'Вы уже играете в эту игру. Пожалуйста, дождитесь окончания текущей игры.';
    } else if (error instanceof InsufficientFundsException) {
      content = 'У вас недостаточно монет для этой игры. ||бомжара||';
    } else {
      this.logger.error('Flip round failed, bet refunded', error);
      content = 'Что-то пошло не так, ваша ставка возвращена.';
    }

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, embeds: [], components: [] });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}
