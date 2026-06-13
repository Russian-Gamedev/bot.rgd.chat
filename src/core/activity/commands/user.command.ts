import { EmbedBuilder } from '@discordjs/builders';
import { Injectable } from '@nestjs/common';
import { GuildMember } from 'discord.js';
import {
  Context,
  MemberOption,
  Options,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';
import { ActivityService } from '#core/activity/activity.service';
import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import {
  formatCoins,
  formatTime,
  getDisplayAvatar,
  getRelativeFormat,
} from '#lib/utils';

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
  constructor(
    private readonly userService: UserService,
    private readonly activityService: ActivityService,
    private readonly walletService: WalletService,
  ) {}

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
    const guildUser = await this.userService.findOrCreateMember(
      guildId,
      targetId,
    );
    const profile = await this.userService.getProfile(targetId);
    const allGuildUsers = await this.userService.getMemberProfiles(targetId);
    const stats = await this.activityService.getGlobalActivityTotal(targetId);
    const balance = await this.walletService.getBalance(targetId);
    if (!profile) return;

    const embed = new EmbedBuilder();

    const leftCount = allGuildUsers.reduce(
      (acc, user) => acc + user.leftCount,
      0,
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
        value: getRelativeFormat(profile.firstJoinedAt.getTime()),
        inline: true,
      },
      {
        name: 'Первый вход / на этом сервере',
        value: getRelativeFormat(guildUser.firstJoinedAt.getTime()),
        inline: true,
      },
      {
        name: 'Уровень уважения',
        value: profile.reputation.toLocaleString('ru'),
        inline: true,
      },
      {
        name: 'Баланс',
        value: formatCoins(balance),
        inline: true,
      },
      {
        name: 'Понаписал',
        value: profile.experience.toLocaleString('ru'),
        inline: true,
      },
      {
        name: 'Наговорил',
        value: formatTime(stats?.voice_seconds ?? 0),
        inline: true,
      },
      {
        name: 'Ливал раз',
        value: `${leftCount}`,
        inline: true,
      },
    ]);

    return interaction.reply({ embeds: [embed] });
  }
}
