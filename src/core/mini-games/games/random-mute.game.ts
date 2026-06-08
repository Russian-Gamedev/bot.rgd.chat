import { Injectable, Logger } from '@nestjs/common';
import { Client, EmbedBuilder, MessageFlags } from 'discord.js';
import { Context, SlashCommand, type SlashCommandContext } from 'necord';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { UserService } from '#core/users/users.service';

@Injectable()
export class RandomMuteGame {
  private readonly logger = new Logger(RandomMuteGame.name);
  constructor(
    readonly _userService: UserService,
    private readonly guildSettings: GuildSettingsService,
    private readonly discord: Client,
  ) {}

  private isVotting = false;
  private isWaitNext = false;

  @SlashCommand({
    name: 'call-shiz-vote',
    description: 'Начать особую "игру"',
  })
  async cronJob(@Context() [interaction]: SlashCommandContext) {
    if (this.isWaitNext) {
      return interaction.reply({
        content: 'Ждем следующего голосования. Пожалуйста, подождите.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (this.isVotting) {
      return interaction.reply({
        content:
          'Уже есть активное голосование. Пожалуйста, дождитесь его окончания.',
        flags: MessageFlags.Ephemeral,
      });
    }
    const guildId = interaction.guildId;
    if (!guildId) return this.logger.debug('Guild ID is missing');
    const guild = await this.discord.guilds.fetch(guildId);
    if (!guild) return this.logger.debug('Guild not found');
    const eventsChannel =
      await this.guildSettings.getEventMessageChannel(guildId);
    if (!eventsChannel) return this.logger.debug('Events channel not found');

    const activeRole = await this.guildSettings.getActiveRole(guildId);
    if (!activeRole) return this.logger.debug('Active role not found');
    this.isVotting = true;

    const muteRoleId = await this.guildSettings.getSetting<string>(
      guildId,
      GuildSettings.ShizRoleId,
    );
    if (!muteRoleId) return this.logger.debug('Mute role not found');

    await interaction.reply({
      content: `Голосование началось! Проверьте канал <#${eventsChannel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });

    const members = await guild.members.fetch();
    const activeMembers = members.filter((member) =>
      member.roles.cache.has(activeRole.id),
    );

    const randomIndex = Math.floor(Math.random() * activeMembers.size);
    const selectedMember = Array.from(activeMembers.values())[randomIndex];
    if (!selectedMember) return this.logger.debug('No active members found');

    const embed = new EmbedBuilder()
      .setTitle('КТО СЕГОДНЯ ШИЗ?')
      .setColor('Random')
      .setDescription(`Отправить <@${selectedMember.user.id}> в дурку?`);

    const msg = await eventsChannel.send({ embeds: [embed] });

    await msg.react('✅');
    await msg.react('❌');

    await Bun.sleep(1000 * 60 * 1); // 5 minutes

    const fetched = await msg.fetch(true);
    const trueReactions = fetched.reactions.cache.get('✅');
    const falseReactions = fetched.reactions.cache.get('❌');

    const trueCount = trueReactions ? trueReactions.count - 1 : 0;
    const falseCount = falseReactions ? falseReactions.count - 1 : 0;

    const totalVotes = trueCount + falseCount;
    if (totalVotes < 5) {
      embed.setTitle('КТО СЕГОДНЯ ШИЗ? (НЕУДАЧА)');
      embed.setDescription(
        `Недостаточно голосов для принятия решения по <@${selectedMember.user.id}>.`,
      );
      await msg.edit({ embeds: [embed] });
      return;
    }
    if (trueCount < falseCount) {
      embed.setTitle('КТО СЕГОДНЯ ШИЗ? (ПРОВАЛ)');
      embed.setDescription(
        `Большинство решило оставить <@${selectedMember.user.id}> с нами!`,
      );
      await msg.edit({ embeds: [embed] });
      return;
    }

    await selectedMember.roles.add(muteRoleId);
    embed.setTitle('КТО СЕГОДНЯ ШИЗ? (УСПЕХ)');
    embed.setDescription(
      `Большинство решило отправить <@${selectedMember.user.id}> в дурку! Он проведет там 1 час.`,
    );
    await msg.edit({ embeds: [embed] });
    await msg.reactions.removeAll();

    this.isWaitNext = true;
    this.isVotting = false;

    setTimeout(
      async () => {
        await selectedMember.roles.remove(muteRoleId);
        await eventsChannel.send(
          `<@${selectedMember.user.id}> вышел из дурки! Поздравляем!`,
        );
        this.isVotting = false;
        this.isWaitNext = false;
      },
      1000 * 60 * 60,
    ); // 1 hour
  }
}
