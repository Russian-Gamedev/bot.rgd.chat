import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord';

import { Colors } from '#config/constants';

import { BlacklistUserDto } from '../dto/blacklist.dto';
import { PortalsService } from '../portals.service';
import { PortalCommandDecorator } from './group.decorator';

@PortalCommandDecorator()
@Injectable()
export class BlacklistCommand {
  constructor(private readonly portalsService: PortalsService) {}

  @Subcommand({
    name: 'blacklist-add',
    description: 'Заблокировать пользователя во всех порталах',
  })
  public async onAdd(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: BlacklistUserDto,
  ) {
    const userId = BigInt(dto.user.id);

    const alreadyBlocked = await this.portalsService.isBlacklisted(userId);
    if (alreadyBlocked) {
      await interaction.reply({
        content: 'Пользователь уже в чёрном списке.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await this.portalsService.addToBlacklist(userId);
    await interaction.reply({
      content: `Пользователь <@${dto.user.id}> добавлен в чёрный список порталов.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Subcommand({
    name: 'blacklist-remove',
    description: 'Разблокировать пользователя во всех порталах',
  })
  public async onRemove(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: BlacklistUserDto,
  ) {
    const userId = BigInt(dto.user.id);

    const isBlocked = await this.portalsService.isBlacklisted(userId);
    if (!isBlocked) {
      await interaction.reply({
        content: 'Пользователь не в чёрном списке.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await this.portalsService.removeFromBlacklist(userId);
    await interaction.reply({
      content: `Пользователь <@${dto.user.id}> удалён из чёрного списка порталов.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  @Subcommand({
    name: 'blacklist-list',
    description: 'Показать чёрный список порталов',
  })
  public async onList(@Context() [interaction]: SlashCommandContext) {
    const userIds = await this.portalsService.listBlacklist();

    if (userIds.length === 0) {
      await interaction.reply({
        content: 'Чёрный список порталов пуст.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(Colors.Primary)
      .setTitle('Чёрный список порталов')
      .setDescription(userIds.map((id) => `<@${id}>`).join('\n'));

    await interaction.reply({ embeds: [embed] });
  }
}
