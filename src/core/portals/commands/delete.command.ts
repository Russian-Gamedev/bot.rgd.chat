import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageFlags } from 'discord.js';
import { Context, Options, type SlashCommandContext, Subcommand } from 'necord';

import { DeletePortalDto } from '../dto/delete-portal.dto';
import { PortalsService } from '../portals.service';
import { PortalCommandDecorator } from './group.decorator';

@PortalCommandDecorator()
@Injectable()
export class DeletePortalCommand {
  constructor(
    private readonly portalsService: PortalsService,
    private readonly config: ConfigService,
  ) {}

  @Subcommand({
    name: 'delete',
    description: 'Удалить портал',
  })
  public async onDelete(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: DeletePortalDto,
  ) {
    if (!this.inWhitelist(interaction.user.id)) {
      await interaction.reply({
        content: 'У вас нет прав на использование этой команды.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await this.portalsService.deletePortal(dto.id);
      await interaction.reply({
        content: `Портал #${dto.id} удалён.`,
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await interaction.reply({
        content: `Ошибка при удалении портала: ${String(error)}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private inWhitelist(userId: string): boolean {
    const whitelist = this.config.get<string[]>('API_ACCESS_WHITELIST', []);
    return whitelist.includes(userId);
  }
}
