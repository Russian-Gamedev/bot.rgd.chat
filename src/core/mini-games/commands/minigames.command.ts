import { Injectable } from '@nestjs/common';
import { EmbedBuilder, GuildMember, MessageFlags } from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  MemberOption,
  Options,
  type SlashCommandContext,
  StringOption,
  Subcommand,
} from 'necord';

import { Colors } from '#config/constants';
import { formatCoins } from '#lib/utils';
import { MiniGame } from '../entities/mini-game-round.entity';
import { MiniGameService } from '../mini-game.service';
import type { MiniGameStatsFilter, MiniGameStatsRow } from '../mini-game.types';
import { MINI_GAME_META } from '../mini-games.constants';

const MiniGamesGroupDecorator = createCommandGroupDecorator({
  name: 'minigames',
  description: 'Мини-игры казино',
});

class GameStatsDto {
  @MemberOption({
    name: 'user',
    description: 'Статистика конкретного пользователя',
    required: false,
  })
  user: GuildMember | null;

  @StringOption({
    name: 'game',
    description: 'Конкретная игра',
    required: false,
    choices: Object.values(MiniGame).map((value) => ({
      name: `${MINI_GAME_META[value].emoji} ${MINI_GAME_META[value].label}`,
      value,
    })),
  })
  game: MiniGame | null;
}

@MiniGamesGroupDecorator()
@Injectable()
export class MiniGamesCommand {
  constructor(private readonly miniGames: MiniGameService) {}

  @Subcommand({
    name: 'stats',
    description: 'Статистика мини-игр: по серверу, игроку или игре',
  })
  async stats(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: GameStatsDto,
  ) {
    if (!interaction.guild) return;

    const filter: MiniGameStatsFilter = {
      guildId: interaction.guild.id,
      userId: dto.user?.id,
      game: dto.game ?? undefined,
    };

    const rows = await this.miniGames.getStatsBreakdown(filter);
    if (rows.length === 0) {
      return interaction.reply({
        content: 'Статистики пока нет — сыграйте в /slot или /flip.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const total = sumRows(rows);
    const lines = rows.map((row) => this.formatRow(row));
    if (rows.length > 1) {
      lines.push(this.formatRow(total));
    }

    if (dto.user) {
      lines.push(`\n🏆 Лучший занос: ${formatCoins(total.biggestWin)}`);
    } else {
      const biggest = await this.miniGames.getBiggestRound(filter);
      if (biggest) {
        lines.push(
          `\n🏆 Лучший занос сервера: ${formatCoins(biggest.payout)} — <@${biggest.user_id}> (${MINI_GAME_META[biggest.game].label})`,
        );
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(
        dto.user
          ? `📊 Статистика мини-игр — ${dto.user.displayName}`
          : '📊 Статистика мини-игр сервера',
      )
      .setDescription(lines.join('\n'))
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setFooter({
        text: dto.game
          ? `Игра: ${MINI_GAME_META[dto.game].label}`
          : 'Все мини-игры',
      })
      .setColor(
        total.net > 0n
          ? '#5fdb00'
          : total.net < 0n
            ? '#ff2f00'
            : Colors.Primary,
      );

    return interaction.reply({ embeds: [embed] });
  }

  private formatRow(row: TotalStatsRow): string {
    const label = row.game
      ? `${MINI_GAME_META[row.game].emoji} ${MINI_GAME_META[row.game].label}`
      : 'Итого';
    const winrate =
      row.rounds > 0 ? Math.round((row.wins / row.rounds) * 100) : 0;
    const net =
      row.net === 0n
        ? '0'
        : `${row.net > 0n ? '+' : '−'}${formatCoins(row.net > 0n ? row.net : -row.net)}`;

    return (
      `**${label}** — ${row.rounds} раундов · винрейт ${winrate}%\n` +
      `Ставки: ${formatCoins(row.totalBet)} · Выплаты: ${formatCoins(row.totalPayout)} · Профит: ${net}`
    );
  }
}

/** Stats row without a game: aggregated across games. */
type TotalStatsRow = Omit<MiniGameStatsRow, 'game'> & {
  game: MiniGame | null;
};

function sumRows(rows: MiniGameStatsRow[]): TotalStatsRow {
  return rows.reduce<TotalStatsRow>(
    (acc, row) => ({
      game: null,
      rounds: acc.rounds + row.rounds,
      wins: acc.wins + row.wins,
      totalBet: acc.totalBet + row.totalBet,
      totalPayout: acc.totalPayout + row.totalPayout,
      biggestWin:
        row.biggestWin > acc.biggestWin ? row.biggestWin : acc.biggestWin,
      net: acc.net + row.net,
    }),
    {
      game: null,
      rounds: 0,
      wins: 0,
      totalBet: 0n,
      totalPayout: 0n,
      biggestWin: 0n,
      net: 0n,
    },
  );
}
