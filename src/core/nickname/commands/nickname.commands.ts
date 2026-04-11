import { EmbedBuilder } from '@discordjs/builders';
import { Injectable } from '@nestjs/common';
import { GuildMember, InteractionContextType, MessageFlags } from 'discord.js';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';

import { NicknameService } from '../nickname.service';

import { NicknameHistoryDto } from './nickname.dto';

@Injectable()
export class NicknameCommands {
  constructor(private readonly nicknameService: NicknameService) {}

  @SlashCommand({
    name: 'nickhistory',
    description: 'Показать историю никнеймов участника',
    contexts: [InteractionContextType.Guild],
  })
  async nickhistory(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: NicknameHistoryDto,
  ) {
    const guild = interaction.guild;
    if (!guild) return;

    const target = dto.member ?? (interaction.member as GuildMember | null);
    if (!target) return;

    const userId = BigInt(target.id);
    const guildId = BigInt(guild.id);

    const history = await this.nicknameService.getHistory(guildId, userId, 10);

    if (!history.length) {
      return interaction.reply({
        content: 'История никнеймов пуста',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x3b5998)
      .setTitle(
        `История никнеймов: ${target.displayName ?? target.user.username}`,
      );

    const fields = history.map((h) => {
      const date = new Date(h.createdAt).toLocaleString('ru', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        name: date,
        value: `**${h.old_nickname ?? '(username)'}** → **${h.new_nickname}**`,
        inline: false,
      };
    });

    embed.setFields(fields);

    return interaction.reply({ embeds: [embed] });
  }
}
