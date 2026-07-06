import { EntityManager } from '@mikro-orm/core';
import { EnsureRequestContext } from '@mikro-orm/decorators/legacy';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  Client,
  EmbedBuilder,
  Guild,
  InteractionContextType,
} from 'discord.js';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';

import { Colors } from '#config/constants';
import { GuildSettings } from '#config/guilds';
import { GuildMemberRolesService } from '#core/guilds/roles/guild-member-roles.service';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { UserService } from '#core/users/users.service';
import { WalletService } from '#core/wallet/wallet.service';
import { formatTime, pickRandom, pluralize } from '#lib/utils';
import { ActivityService, ActivityStats } from './activity.service';

export enum ActivityPeriod {
  Day = 'day',
  Week = 'week',
  Month = 'month',
}

@Injectable()
export class ActivityJobService {
  private readonly logger = new Logger(ActivityJobService.name);

  constructor(
    readonly em: EntityManager,
    private readonly discord: Client,
    private readonly activityService: ActivityService,
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly guildSettings: GuildSettingsService,
    private readonly guildMemberRolesService: GuildMemberRolesService,
  ) {}

  @SlashCommand({
    name: 'activity',
    description: 'Показать ежедневную активность на сервере',
    contexts: [InteractionContextType.Guild],
  })
  async activityCommand(@Context() [interaction]: SlashCommandContext) {
    if (!interaction.guild) return;

    const period = ActivityPeriod.Day;
    const [start, end] = this.getPeriodRange(period);

    const activities = await this.activityService.getActivityStatsInRange(
      interaction.guild.id,
      start,
      end,
    );

    if (activities.length === 0) {
      await interaction.reply({
        content: 'Нет данных об активности за сегодня.',
        ephemeral: true,
      });
      return;
    }

    const embed = await this.buildEmbed(
      activities,
      period,
      BigInt(interaction.guild.id),
    );

    await interaction.reply({ embeds: [embed] });
  }

  @Cron('0 15 * * *', { name: 'daily-activity' })
  @EnsureRequestContext()
  async handleDailyJob() {
    /// Runs every day at 15:00 MSK
    this.logger.log('Running daily activity job');

    const guilds = await this.discord.guilds.fetch();
    const globalActiveUsers = new Set<bigint>();

    for (const { id } of guilds.values()) {
      const guild = await this.discord.guilds.fetch(id);

      const activeUsers = await this.calculateDailyActivity(guild).catch(
        (err) => {
          this.logger.error(
            `Failed to calculate daily activity for guild ${guild.id}: ${err.message}`,
          );
          return [];
        },
      );
      for (const userId of activeUsers) globalActiveUsers.add(userId);

      await this.giveAwayDailyCoins(guild).catch((err) => {
        this.logger.error(
          `Failed to give away daily coins for guild ${guild.id}: ${err.message}`,
        );
      });

      await this.postActivitySummary(guild, ActivityPeriod.Day);
      const today = new Date();

      const isSaturday = today.getDay() === 6;

      if (isSaturday) {
        await this.postActivitySummary(guild, ActivityPeriod.Week);
      }

      const isLastDayOfMonth =
        new Date(today.getTime() + 1_000 * 60 * 60 * 24).getDate() === 1;

      if (isLastDayOfMonth) {
        await this.postActivitySummary(guild, ActivityPeriod.Month);
      }
    }

    await this.activityService.updateProfileStreaks([...globalActiveUsers]);
  }

  private async giveAwayDailyCoins(guild: Guild) {
    const [start, end] = this.getPeriodRange(ActivityPeriod.Day);
    const activities = await this.activityService.getActivityStatsInRange(
      guild.id,
      start,
      end,
    );

    for (const activity of activities) {
      try {
        const coinsPerMinute = Math.floor(activity.voice_seconds / 60);
        const coins = activity.message_score + coinsPerMinute;
        if (coins === 0) return;
        const user = await this.userService.findOrCreateMember(
          BigInt(guild.id),
          activity.user_id,
        );
        await this.walletService.credit(user, BigInt(coins), 'daily-reward');
      } catch (err) {
        if (err instanceof Error) {
          this.logger.warn(
            `Failed to give coins to user ${activity.user_id} in guild ${guild.id}: ${err.message}`,
          );
        }
      }
    }
  }

  private async calculateDailyActivity(guild: Guild): Promise<bigint[]> {
    const activeRole = await this.guildSettings.getActiveRole(guild.id);
    const enabledAutoRole = await this.guildSettings.getSetting<boolean>(
      BigInt(guild.id),
      GuildSettings.ActiveAutoGiveRole,
      false,
    );
    const activeRoleThreshold = await this.guildSettings.getSetting<number>(
      BigInt(guild.id),
      GuildSettings.ActiveAutoGiveRoleThreshold,
      7,
    );
    const activeRemoveThreshold = await this.guildSettings.getSetting<number>(
      BigInt(guild.id),
      GuildSettings.ActiveAutoRemoveRoleThreshold,
      30,
    );

    const [start, end] = this.getPeriodRange(ActivityPeriod.Day);
    const activities = await this.activityService.getActivityStatsInRange(
      guild.id,
      start,
      end,
    );

    const activeUsers: bigint[] = [];

    for (const activity of activities) {
      const MESSAGE_THRESHOLD = 25;
      const VOICE_THRESHOLD = 60 * 30; // in seconds
      if (
        activity.message_score > MESSAGE_THRESHOLD ||
        activity.voice_seconds > VOICE_THRESHOLD
      ) {
        activeUsers.push(activity.user_id);
      }
    }

    this.logger.log(
      `Guild ${guild.id} - Active users today: ${activeUsers.length}`,
    );

    /// reset streaks for inactive users
    await this.activityService.resetInactiveMemberStreaks(
      guild.id,
      activeUsers,
    );

    const checkAutoRole = enabledAutoRole && activeRole;

    // increase streaks for active users
    for (const userId of activeUsers) {
      try {
        const user = await this.userService.findOrCreateMember(
          guild.id,
          userId,
        );
        await this.activityService.increaseMemberStreak(user);
        if (!checkAutoRole) continue;

        if (user.activeStreak >= activeRoleThreshold!) {
          this.logger.log(
            `User ${user.user_id} in guild ${guild.id} has an active streak of ${user.activeStreak} days!`,
          );

          await this.guildMemberRolesService
            .addGuildRole(
              guild.id,
              user.user_id,
              activeRole.id,
              'Active streak threshold reached',
            )
            .catch((err) => {
              this.logger.warn(
                `Failed to give active role to user ${user.user_id} in guild ${guild.id}: ${err.message}`,
              );
            });
        }
      } catch (err) {
        if (err instanceof Error) {
          this.logger.warn(
            `Failed to process streak for user ${userId} in guild ${guild.id}: ${err.message}`,
          );
        }
      }
    }

    for (const member of activeRole?.members ?? []) {
      try {
        const userId = BigInt(member[0]);
        const user = await this.userService.findOrCreateMember(
          guild.id,
          userId,
        );
        const activityTotal = await this.activityService.getGuildActivityTotal(
          guild.id,
          userId,
        );
        if (!checkAutoRole) continue;
        if (
          activityTotal?.lastActiveAt == null ||
          Date.now() - activityTotal.lastActiveAt.getTime() >
            activeRemoveThreshold! * 24 * 60 * 60 * 1000
        ) {
          this.logger.log(
            `Removing active role from user ${user.user_id} in guild ${guild.id} due to inactivity`,
          );
          await this.guildMemberRolesService
            .removeGuildRole(
              guild.id,
              user.user_id,
              activeRole.id,
              'Active streak inactivity threshold reached',
            )
            .catch((err) => {
              this.logger.warn(
                `Failed to remove active role from user ${user.user_id} in guild ${guild.id}: ${err.message}`,
              );
            });
        }
      } catch (err) {
        if (err instanceof Error) {
          this.logger.warn(
            `Failed to process role removal for member ${member[0]} in guild ${guild.id}: ${err.message}`,
          );
        }
      }
    }

    return activeUsers;
  }

  private async postActivitySummary(guild: Guild, period: ActivityPeriod) {
    const postMessages = await this.guildSettings
      .getSetting(BigInt(guild.id), GuildSettings.PostActivityMessages, false)
      .then((value) => this.guildSettings.asBoolean(value));

    if (!postMessages) return;

    const [start, end] = this.getPeriodRange(period);
    const activities = await this.activityService.getActivityStatsInRange(
      guild.id,
      start,
      end,
    );

    if (activities.length === 0) {
      this.logger.log(
        `No activity data for guild ${guild.id} and period ${period}`,
      );
      return;
    }

    const channelId = await this.guildSettings.getSetting<string>(
      BigInt(guild.id),
      GuildSettings.EventMessageChannel,
    );

    if (!channelId) return;

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isSendable()) return;

    const embed = await this.buildEmbed(activities, period, BigInt(guild.id));

    await channel.send({ embeds: [embed] });
  }

  private async buildEmbed(
    activities: ActivityStats[],
    period: ActivityPeriod,
    guildId: bigint,
  ) {
    const [date] = this.getPeriodRange(period);
    const newRegs = await this.userService.getNewUsers(date, guildId);
    const usersStreak = await this.activityService.getTopMemberStreaks(
      guildId,
      15,
    );

    const embed = new EmbedBuilder();

    const title = {
      [ActivityPeriod.Day]: 'Ежедневная статистика',
      [ActivityPeriod.Week]: 'Еженедельная статистика',
      [ActivityPeriod.Month]: 'Ежемесячная статистика',
    }[period];

    embed.setTitle(title);

    const sort = (
      data: ActivityStats[],
      key: keyof Pick<
        ActivityStats,
        'voice_seconds' | 'message_score' | 'reaction_count'
      >,
    ) =>
      data
        .sort((a, b) => b[key] - a[key])
        .map((value) => ({ user: value.user_id, value: value[key] }))
        .slice(0, 15)
        .filter((a) => a.value > 0);

    const buildLine = (
      userId: bigint,
      value: number | string,
      rank: number | string,
    ) => {
      const userTag = `<@${userId.toString()}>`;
      return `${rank}. ${userTag}: \`${value}\`\n`;
    };

    const buildTop = <T>(
      data: T[],
      buildLine: (item: T, rank: number) => string,
      emptyText: string,
    ) => {
      let text = data.reduce(
        (acc, item, index) => acc + buildLine(item, index + 1),
        '',
      );
      if (text === '') text = emptyText;
      return text;
    };

    const topVoice = buildTop(
      sort(activities, 'voice_seconds'),
      (item, rank) => buildLine(item.user, formatTime(item.value, 3), rank),
      'никто не заходил в войс :(',
    );

    const topMessages = buildTop(
      sort(activities, 'message_score'),
      (item, rank) => buildLine(item.user, item.value, rank),
      'никто не писал :(',
    );

    const reactionsRaw = activities.sort(
      (a, b) => b.reaction_count - a.reaction_count,
    );

    const lastReactions = reactionsRaw.at(-1);
    const reactions = reactionsRaw
      .filter((a) => a.reaction_count > 0)
      .slice(0, 15);

    /// shit code to always show the last user in the list
    if (
      Number(lastReactions?.reaction_count) < 0 ||
      (Number(reactions.at(-1)?.reaction_count) < 0 &&
        reactions.at(-1)?.reaction_count !== lastReactions?.reaction_count)
    ) {
      reactions.push(lastReactions!);
    }

    const randomClownEmoji = pickRandom([
      '🤡',
      '<:poel:874759751043514379>',
      '<:clown:965322944731570266>',
      '<:kolyatrap:746270313112928257>',
      '<:mdnt:1121918483010171033>',
    ]);

    const topReactions = buildTop(
      reactions,
      (item, rank) =>
        buildLine(
          item.user_id,
          item.reaction_count,
          item.reaction_count >= 0 ? rank : randomClownEmoji,
        ),
      'никто не реагировал :(',
    );

    const topNewRegs = buildTop(
      newRegs.slice(0, 15),
      (item, rank) => `${rank}. <@${item.user_id}>\n`,
      'никто не пришел к нам :(',
    );

    const totalActives = activities.length.toLocaleString('ru-RU');

    const topStreaks = buildTop(
      usersStreak,
      (item, rank) =>
        buildLine(
          item.user_id,
          `${item.activeStreak} ${pluralize(item.activeStreak, ['день', 'дня', 'дней'])}`,
          rank,
        ),
      'никто не держит активную серию :(',
    );

    embed.addFields(
      { name: 'Стата по войсу', value: topVoice, inline: true },
      { name: 'Стата по чату', value: topMessages, inline: true },
      { name: '\u200b', value: '\u200b' },
      { name: 'Подсчёт неплохих цифр', value: topReactions, inline: true },
      { name: 'Новореги', value: topNewRegs, inline: true },
      { name: '\u200b', value: '\u200b' },
      { name: 'Активные пользователи', value: topStreaks, inline: true },
      { name: 'Писало в чате', value: totalActives, inline: false },
    );

    embed.setColor(Colors.Primary);

    return embed;
  }

  private getPeriodRange(period: ActivityPeriod): [Date, Date] {
    const end = new Date();
    end.setHours(24, 0, 0, 0);

    const start = new Date(end);
    const days = {
      [ActivityPeriod.Day]: 1,
      [ActivityPeriod.Week]: 7,
      [ActivityPeriod.Month]: 30,
    }[period];
    start.setDate(start.getDate() - days);

    return [start, end];
  }
}
