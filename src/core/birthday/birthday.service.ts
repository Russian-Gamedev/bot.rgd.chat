import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Client, EmbedBuilder } from 'discord.js';

import { GuildSettings } from '#config/guilds';
import { GuildMemberRolesService } from '#core/guilds/roles/guild-member-roles.service';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { UserService } from '#core/users/users.service';
import { DiscordID } from '#root/lib/types';

interface UpcomingBirthday {
  userId: DiscordID;
  displayName: string;
  nextBirthday: Date;
  daysUntil: number;
  age: number;
}

@Injectable()
export class BirthdayService {
  private readonly logger = new Logger(BirthdayService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly userService: UserService,
    private readonly discord: Client,
    private readonly guildSettings: GuildSettingsService,
    private readonly guildMemberRolesService: GuildMemberRolesService,
  ) {}

  @EnsureRequestContext()
  @Cron('0 8 * * *', { name: 'birthday-greeting' })
  async postBirthdayGreeting() {
    const guilds = this.discord.guilds.cache;

    for (const guild of guilds.values()) {
      const guildId = BigInt(guild.id);
      this.logger.log(`Posting birthday greetings for guild ${guildId}`);

      const birthdayRoleId = await this.guildSettings.getSetting<string>(
        guildId,
        GuildSettings.BirthdayRoleId,
      );
      if (!birthdayRoleId) {
        this.logger.log(
          `No birthday role set for guild ${guildId}, skipping role assignment`,
        );
        continue;
      }

      const birthdayRole = await guild.roles.fetch(birthdayRoleId);

      if (!birthdayRole) {
        this.logger.log(
          `Birthday role with ID ${birthdayRoleId} not found in guild ${guildId}, skipping role assignment`,
        );
        continue;
      }

      await this.guildMemberRolesService
        .removeRoleFromCurrentMembers(birthdayRole, 'Removing birthday role')
        .catch((err) => {
          if (err instanceof Error) {
            this.logger.error(
              `Failed to remove birthday role in guild ${guildId}: ${err.message}`,
            );
          }
        });

      const today = new Date();

      const users = await this.userService.getBirthdayUsers(
        guildId,
        today.getMonth() + 1,
        today.getDate(),
      );

      if (!users.length) continue;

      this.logger.log(`Found ${users.length} users with birthdays today`);
      const eventChannel =
        await this.guildSettings.getEventMessageChannel(guildId);

      if (!eventChannel) {
        this.logger.log(`No event channel set for guild ${guildId}, skipping`);
        continue;
      }

      const embed = new EmbedBuilder()
        .setColor(0xff41fb)
        .setTitle('🎉 СЕГОДНЯШНИЕ ИМЕНИННИКИ 🎉')
        .setFooter({ text: 'Поздравляем их с днём рождения! 🎂' });

      let field = '';

      for (const user of users) {
        const member = await guild.members
          .fetch(user.user_id.toString())
          .catch(() => null);
        if (!member) continue;
        const birthDate = new Date(user.birthDate!);
        const age = today.getFullYear() - birthDate.getFullYear();
        field += `🎂 <@${member.id}> празнует своё ${age} летие\n`;

        await this.guildMemberRolesService
          .addGuildRole(
            guildId,
            member.id,
            birthdayRoleId,
            'Birthday role assignment',
          )
          .catch((err) => {
            if (err instanceof Error) {
              this.logger.error(
                `Failed to assign birthday role to user ${member.id} in guild ${guildId}: ${err.message}`,
              );
            }
          });
      }
      embed.setFields([{ name: 'и вот их список', value: field }]);
      await eventChannel.send({ embeds: [embed] });
    }
  }

  async getUpcomingBirthdays(
    guildId: bigint,
    limit = 10,
  ): Promise<UpcomingBirthday[]> {
    const users = await this.userService.getUsersWithBirthdaySet(guildId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming: UpcomingBirthday[] = [];

    const guild = await this.discord.guilds.fetch(guildId.toString());

    for (const user of users) {
      if (!user.birthDate) continue;

      const birthDate = new Date(user.birthDate);
      const nextBirthday = new Date(today);
      nextBirthday.setMonth(birthDate.getMonth());
      nextBirthday.setDate(birthDate.getDate());

      if (nextBirthday < today) {
        nextBirthday.setFullYear(today.getFullYear() + 1);
      }

      const daysUntil = Math.ceil(
        (nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      const age = nextBirthday.getFullYear() - birthDate.getFullYear();

      const displayName = await guild.members
        .fetch(user.user_id.toString())
        .then(() => `<@${user.user_id}>`)
        .catch(() => user.username);

      upcoming.push({
        userId: user.user_id,
        displayName,
        nextBirthday,
        daysUntil,
        age,
      });
    }

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil).slice(0, limit);
  }
}
