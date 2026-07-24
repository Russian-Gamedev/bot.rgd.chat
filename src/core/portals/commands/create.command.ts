import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelType, MessageFlags } from 'discord.js';
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord';

import { CreatePortalDto } from '../dto/create-portal.dto';
import { PortalsService } from '../portals.service';
import { PortalCommandDecorator } from './group.decorator';

@PortalCommandDecorator()
@Injectable()
export class CreatePortalCommand {
  constructor(
    private readonly portalsService: PortalsService,
    private readonly config: ConfigService,
  ) {}

  @Subcommand({
    name: 'create',
    description: 'Создать портал с текущим каналом',
  })
  public async onCreate(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: CreatePortalDto,
  ) {
    if (!this.inWhitelist(interaction.user.id)) {
      await interaction.reply({
        content: 'У вас нет прав на использование этой команды.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sourceChannel = interaction.channel;
    if (
      !sourceChannel?.isTextBased() ||
      sourceChannel.type === ChannelType.DM
    ) {
      await interaction.reply({
        content:
          'Эта команда должна быть вызвана из текстового канала на сервере.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!dto.target_channel.isTextBased()) {
      await interaction.reply({
        content: 'Целевой канал должен быть текстовым.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sourceChannel.id === dto.target_channel.id) {
      await interaction.reply({
        content: 'Нельзя создать портал между одним и тем же каналом.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const portal = await this.portalsService.createPortal(
        sourceChannel,
        dto.target_channel,
        BigInt(interaction.user.id),
      );

      await interaction.editReply({
        content: `Портал #${portal.id} создан между <#${portal.channel_a_id}> и <#${portal.channel_b_id}>`,
      });
    } catch (error) {
      await interaction.editReply({
        content: `Ошибка при создании портала: ${String(error)}`,
      });
    }
  }

  private inWhitelist(userId: string): boolean {
    const whitelist = this.config.get<string[]>('API_ACCESS_WHITELIST', []);
    return whitelist.includes(userId);
  }
}
