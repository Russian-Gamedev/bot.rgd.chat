import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Client,
  EmbedBuilder,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventRecurrenceRuleFrequency,
} from 'discord.js';
import { Once } from 'necord';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import { UserService } from './users.service';

@Injectable()
export class BirthdayService {
  private readonly logger = new Logger(BirthdayService.name);

  constructor(
    private readonly userService: UserService,
    private readonly discord: Client,
    private readonly guildSettings: GuildSettingsService,
  ) {}

  @Once('clientReady')
  async onClientReady() {
    await this.setupBirthdayEvents();
  }

  @Cron('0 8 * * *')
  async postBirthdayGreeting() {
    await this.setupBirthdayEvents();

    const guilds = this.discord.guilds.cache;
    for (const guild of guilds.values()) {
      const guildId = BigInt(guild.id);
      this.logger.log(`Posting birthday greetings for guild ${guildId}`);

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

      birthdayRole.members.forEach(async (member) => {
        try {
          await member.roles.remove(birthdayRoleId, 'Removing birthday role');
        } catch (err) {
          if (err instanceof Error) {
            this.logger.error(
              `Failed to remove birthday role from user ${member.id} in guild ${guildId}: ${err.message}`,
            );
          }
        }
      });

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
        const birthDate = new Date(user.birth_date!);
        const age = today.getFullYear() - birthDate.getFullYear();
        field += `🎂 <@${member.id}> празнует своё ${age} летие\n`;

        // Assign birthday role
        try {
          await member.roles.add(birthdayRoleId, 'Birthday role assignment');
        } catch (err) {
          if (err instanceof Error) {
            this.logger.error(
              `Failed to assign birthday role to user ${member.id} in guild ${guildId}: ${err.message}`,
            );
          }
        }
      }
      embed.setFields([{ name: 'и вот их список', value: field }]);
      await eventChannel.send({ embeds: [embed] });
    }
  }

  async setupBirthdayEvents() {
    const guilds = this.discord.guilds.cache;
    for (const guild of guilds.values()) {
      const guildId = BigInt(guild.id);
      this.logger.log(`Setting up birthday events for guild ${guildId}`);

      const createBirthdayEvents = await this.guildSettings
        .getSetting(guildId, GuildSettings.CreateBirthdayEvents, false)
        .then((setting) => this.guildSettings.asBoolean(setting));
      if (!createBirthdayEvents) {
        this.logger.log(
          `Birthday events creation disabled for guild ${guildId}, skipping`,
        );
        continue;
      }

      const users = await this.userService.getUsersWithBirthdaySet(guildId);
      this.logger.log(`Found ${users.length} users with birthdays set`);

      const eventChannel =
        await this.guildSettings.getEventMessageChannel(guildId);
      if (!eventChannel) {
        this.logger.log(`No event channel set for guild ${guildId}, skipping`);
        continue;
      }

      const events = await guild.scheduledEvents.fetch();
      const birthdayEvents = events.filter((event) =>
        event.name.startsWith('Birthday: '),
      );

      for (const event of birthdayEvents.values()) {
        const username = event.name.replace('Birthday: ', '');
        const user = users.find((u) => u.username === username);
        if (!user) {
          this.logger.log(
            `Deleting birthday event ${event.id} for user ${username} (not found)`,
          );
          await event.delete();
        }
      }

      // Create or update events
      for (const user of users) {
        const birthdayDate = new Date(user.birth_date!);
        birthdayDate.setHours(8, 0, 0, 0);

        const now = new Date();
        if (birthdayDate < now) {
          birthdayDate.setFullYear(now.getFullYear() + 1);
        } else {
          birthdayDate.setFullYear(now.getFullYear());
        }

        const eventName = `Birthday: ${user.username}`;
        const event = birthdayEvents.find((e) => e.name === eventName);

        if (!event) {
          this.logger.log(`Creating birthday event for user ${user.user_id}`);
          await guild.scheduledEvents.create({
            name: eventName,
            scheduledStartTime: birthdayDate,
            scheduledEndTime: new Date(
              birthdayDate.getTime() + 24 * 60 * 60 * 1000,
            ), // 24 hours later
            reason: 'User birthday event',
            description: `Празднуем день рождения ${user.username}!`,
            entityType: GuildScheduledEventEntityType.External,
            privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
            channel: eventChannel.id,
            entityMetadata: {
              location: 'Чат сервера',
            },
            recurrenceRule: {
              frequency: GuildScheduledEventRecurrenceRuleFrequency.Yearly,
              startAt: birthdayDate,
              interval: 1,
              byMonth: [birthdayDate.getMonth() + 1],
              byMonthDay: [birthdayDate.getDate()],
            },
          });
        }
      }
    }
  }
}
