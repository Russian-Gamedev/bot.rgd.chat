import { Injectable } from '@nestjs/common';
import {
  ChannelType,
  EmbedBuilder,
  GuildChannel,
  MessageFlags,
} from 'discord.js';
import {
  ChannelOption,
  Context,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord';

import { GuildSettings } from '#config/guilds';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { MahoragaReason } from '#core/mahoraga/mahoraga.types';
import { MahoragaCaseService } from '#core/mahoraga/mahoraga-case.service';

import { MahoragaCommandDecorator } from './mahoraga.command';

class MahoragaHoneypotSetDto {
  @ChannelOption({
    name: 'channel',
    description: 'Канал для honeypot ловушки',
    required: true,
    channel_types: [ChannelType.GuildText],
  })
  channel: GuildChannel;
}

@MahoragaCommandDecorator({
  name: 'honeypot',
  description: 'Honeypot channel management',
})
@Injectable()
export class MahoragaHoneypotCommand {
  constructor(
    private readonly guildSettings: GuildSettingsService,
    private readonly caseService: MahoragaCaseService,
  ) {}

  @Subcommand({
    name: 'set',
    description: 'Назначить канал для honeypot',
  })
  async set(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: MahoragaHoneypotSetDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = dto.channel;
    if (!channel.isTextBased() || !channel.isSendable()) {
      await interaction.editReply({
        content: 'Указанный канал не поддерживает отправку сообщений.',
      });
      return;
    }

    const guildId = interaction.guildId!;

    const count = await this.caseService.countByReasonAndGuild(
      MahoragaReason.Honeypot,
      guildId,
    );

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle('НЕ ПИШИТЕ СЮДА СООБЩЕНИЯ')
      .setDescription(
        'Этот канал для рыбалки спам ботов. За любое сообщение вы получите softban. (если вы глупенький и нажали разбана не будет)',
      )
      .setFooter({ text: `Поймано спаммеров: ${count}` });

    const existingMessageId = await this.guildSettings.getSetting<string>(
      guildId,
      GuildSettings.MahoragaHoneypotMessageId,
      null,
    );

    if (existingMessageId) {
      try {
        const existingMessage = await channel.messages.fetch(existingMessageId);
        await existingMessage.edit({ embeds: [embed] });
        await this.guildSettings.setSetting(
          guildId,
          GuildSettings.MahoragaHoneypotChannelId,
          channel.id,
        );
        await interaction.editReply({
          content: `<#${channel.id}> назначен каналом honeypot. Embed обновлён.`,
        });
        return;
      } catch {
        // Message was deleted, send new one
      }
    }

    const newMessage = await channel.send({ embeds: [embed] });
    await Promise.all([
      this.guildSettings.setSetting(
        guildId,
        GuildSettings.MahoragaHoneypotChannelId,
        channel.id,
      ),
      this.guildSettings.setSetting(
        guildId,
        GuildSettings.MahoragaHoneypotMessageId,
        newMessage.id,
      ),
    ]);

    await interaction.editReply({
      content: `<#${channel.id}> назначен каналом honeypot. Embed отправлен.`,
    });
  }
}
