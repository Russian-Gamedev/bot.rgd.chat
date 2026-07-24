import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { Context, type SlashCommandContext, Subcommand } from 'necord';

import { Colors } from '#config/constants';

import { PortalsService } from '../portals.service';
import { PortalCommandDecorator } from './group.decorator';

@PortalCommandDecorator()
@Injectable()
export class ListPortalsCommand {
  constructor(private readonly portalsService: PortalsService) {}

  @Subcommand({
    name: 'list',
    description: 'Показать список всех порталов',
  })
  public async onList(@Context() [interaction]: SlashCommandContext) {
    const portals = await this.portalsService.listPortals();

    if (portals.length === 0) {
      await interaction.reply({
        content: 'Нет активных порталов.',
        flags: 64,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Primary)
      .setTitle('Активные порталы')
      .setFields(
        portals.map((portal) => ({
          name: `#${portal.id}`,
          value: `<#${portal.channel_a_id}> <-> <#${portal.channel_b_id}>`,
          inline: false,
        })),
      );

    await interaction.reply({ embeds: [embed] });
  }
}
