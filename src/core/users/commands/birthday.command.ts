import { EmbedBuilder } from '@discordjs/builders';
import { Injectable } from '@nestjs/common';
import { MessageFlags } from 'discord.js';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';

import { pluralize } from '#root/lib/utils';

import { BirthdayService } from '../birthday.service';
import { SetBirthdayDto } from '../dto/user.dto';
import { UserService } from '../users.service';

@Injectable()
export class BirthdayCommands {
  constructor(
    private readonly birthdayService: BirthdayService,
    private readonly userService: UserService,
  ) {}

  @SlashCommand({
    name: 'birthdays',
    description: 'Показать ближайших именинников',
  })
  async getUpcomingBirthdays(@Context() [interaction]: SlashCommandContext) {
    const guild = interaction.guild;
    if (!guild) return;

    const upcoming = await this.birthdayService.getUpcomingBirthdays(
      BigInt(guild.id),
      5,
    );

    if (!upcoming.length) {
      return interaction.reply({
        content: 'Нет записей о днях рождения',
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xff41fb)
      .setTitle('🎂 Ближайшие дни рождения');

    const fields = upcoming.map((b) => {
      const date = b.nextBirthday.toLocaleDateString('ru', {
        day: 'numeric',
        month: 'long',
      });
      const daysUntil = b.daysUntil;
      const userMention = `<@${b.userId}>`;
      const daysText = pluralize(daysUntil, ['день', 'дня', 'дней']);
      const upcomingAgeText = pluralize(b.age, ['год', 'года', 'лет']);
      const value = `${userMention} через ${daysUntil} ${daysText} будет ${b.age} ${upcomingAgeText}`;
      return {
        name: date,
        value: value,
        inline: false,
      };
    });

    embed.setFields(fields);
    return interaction.reply({ embeds: [embed] });
  }

  @SlashCommand({
    name: 'birthday-set',
    description: 'Установить дату рождения',
  })
  async setBirthday(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: SetBirthdayDto,
  ) {
    const guild = interaction.guild;
    if (!guild) return;

    let date: Date | null;

    try {
      if (!dto.date?.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        throw new Error('Invalid date');
      }

      date = dto.date
        ? new Date(dto.date.split('.').reverse().join('-'))
        : null;
      if (date && isNaN(date.getTime())) throw new Error('Invalid date');
    } catch {
      return interaction.reply({
        content: 'Неверный формат даты. Используйте ДД.ММ.ГГГГ',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildId = BigInt(guild.id);
    const userId = BigInt(interaction.user.id);
    const user = await this.userService.findOrCreate(guildId, userId);

    await this.userService.setBirthday(user, date);

    await interaction.reply({
      content: date
        ? `Дата рождения установлена на ${date.toLocaleDateString('ru')}`
        : 'Дата рождения удалена',
    });
  }
}
