import { Injectable } from '@nestjs/common';
import { EmbedBuilder, InteractionContextType } from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  type SlashCommandContext,
  Subcommand,
} from 'necord';

import { Colors } from '#config/constants';
import { formatCoins, formatTime } from '#root/lib/utils';

import { UserService } from '../users.service';

const TopCommandDecorator = createCommandGroupDecorator({
  name: 'top',
  description: 'Top activity commands',
  contexts: [InteractionContextType.Guild],
});

@TopCommandDecorator()
@Injectable()
export class TopCommand {
  constructor(private readonly userService: UserService) {}

  @Subcommand({
    name: 'voice',
    description: 'Показать топ по голосовой активности',
  })
  async topVoice(@Context() [interaction]: SlashCommandContext) {
    const guildId = BigInt(interaction.guildId!);

    const users = await this.userService.getTopUsersByField(
      guildId,
      'voice_time',
      10,
    );

    const formattedUsers = users.map((user) => ({
      user_id: user.user_id,
      value: formatTime(user.voice_time),
    }));

    const embed = this.buildEmbed('Топ по времени в войсе', formattedUsers);
    return interaction.reply({ embeds: [embed] });
  }

  @Subcommand({
    name: 'chat',
    description: 'Показать топ по чату',
  })
  async topChat(@Context() [interaction]: SlashCommandContext) {
    const guildId = BigInt(interaction.guildId!);

    const users = await this.userService.getTopUsersByField(
      guildId,
      'experience',
      10,
    );

    const formattedUsers = users.map((user) => ({
      user_id: user.user_id,
      value: user.experience.toLocaleString('ru-RU'),
    }));

    const embed = this.buildEmbed('Топ по активности в чате', formattedUsers);
    return interaction.reply({ embeds: [embed] });
  }

  @Subcommand({
    name: 'coins',
    description: 'Показать топ по монетам',
  })
  async topCoins(@Context() [interaction]: SlashCommandContext) {
    const guildId = BigInt(interaction.guildId!);

    const users = await this.userService.getTopUsersByField(
      guildId,
      'coins',
      10,
    );

    const formattedUsers = users.map((user) => ({
      user_id: user.user_id,
      value: formatCoins(user.coins),
    }));

    const embed = this.buildEmbed('Топ по монетам', formattedUsers);
    return interaction.reply({ embeds: [embed] });
  }

  private buildEmbed(
    title: string,
    users: { user_id: bigint; value: string }[],
  ) {
    const embed = new EmbedBuilder();
    embed.setColor(Colors.Primary);

    const value = users
      .map((user, i) => `${i + 1}. <@${user.user_id}>: ${user.value}`)
      .join('\n');

    embed.setFields([{ name: title, value, inline: true }]);

    return embed;
  }
}
