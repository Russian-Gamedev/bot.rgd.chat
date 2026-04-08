import { EmbedBuilder } from '@discordjs/builders';
import { Injectable } from '@nestjs/common';
import { GuildMember, MessageFlags } from 'discord.js';
import {
  Context,
  MemberOption,
  Options,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';

import {
  formatCoins,
  formatTime,
  getDisplayAvatar,
  getRelativeFormat,
} from '#root/lib/utils';

import { SetBirthdayDto } from '../dto/user.dto';
import { UserEntity } from '../entities/user.entity';
import { UserService } from '../users.service';

class GetUserDto {
  @MemberOption({
    name: 'user',
    required: false,
    description: 'Другой пользователь',
  })
  member: GuildMember;
}

@Injectable()
export class UserCommands {
  constructor(private readonly userService: UserService) {}

  @SlashCommand({
    name: 'user',
    description: 'Информация о себе/пользователе',
  })
  async getUserInfo(
    @Context() [interaction]: SlashCommandContext,
    @Options() { member }: GetUserDto,
  ) {
    const guild = interaction.guild;
    if (!guild) return;
    const guildId = BigInt(guild.id);
    const targetId = BigInt(member?.id ?? interaction.user.id);
    const target = await guild.members
      .fetch(targetId.toString())
      .catch(() => null);
    if (!target) return;
    const guildUser = await this.userService.findOrCreate(guildId, targetId);
    const allUser = await this.userService.getUserFromGuilds(targetId);
    if (!allUser) return;

    const embed = new EmbedBuilder();

    const getTotal = (key: keyof UserEntity) =>
      allUser.reduce((acc, user) => acc + (user[key] as number), 0);

    const getMin = (key: keyof UserEntity) =>
      allUser.reduce(
        (min, user) =>
          (user[key] as number) < min ? (user[key] as number) : min,
        Infinity,
      );

    embed.setColor(target.displayColor);
    embed.setThumbnail(getDisplayAvatar(target.user));

    embed.setFields([
      {
        name: 'Имя аккаунта',
        value: target.user.username,
        inline: true,
      },
      { name: 'Упоминание', value: `<@${target.id}>`, inline: true },
      {
        name: 'Создан',
        value: getRelativeFormat(target.user.createdTimestamp),
        inline: true,
      },
      {
        name: 'Первый вход / на ргд',
        value: getRelativeFormat(getMin('first_joined_at')),
        inline: true,
      },
      {
        name: 'Первый вход / на этом сервере',
        value: getRelativeFormat(guildUser.first_joined_at.getTime()),
        inline: true,
      },
      {
        name: 'Уровень уважения',
        value: getTotal('reputation').toLocaleString('ru'),
        inline: true,
      },
      {
        name: 'Баланс',
        value: formatCoins(guildUser.coins),
        inline: true,
      },
      {
        name: 'Понаписал',
        value: getTotal('experience').toLocaleString('ru'),
        inline: true,
      },
      {
        name: 'Наговорил',
        value: formatTime(getTotal('voice_time')),
        inline: true,
      },
      {
        name: 'Ливал раз',
        value: `${getTotal('left_count')}`,
        inline: true,
      },
    ]);

    return interaction.reply({ embeds: [embed] });
  }

  @SlashCommand({
    name: 'set-birthday',
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
