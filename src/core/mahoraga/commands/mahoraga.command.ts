import { Injectable, NotFoundException } from '@nestjs/common';
import { InteractionContextType, MessageFlags, User } from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  Options,
  type SlashCommandContext,
  StringOption,
  Subcommand,
  UserOption,
} from 'necord';

import { MahoragaService } from '../mahoraga.service';

class MahoragaUnbanCommandDto {
  @UserOption({
    name: 'user',
    description: 'Discord user to remove from Mahoraga softban',
    required: true,
  })
  user: User;

  @StringOption({
    name: 'reason',
    description: 'Why this user is being unbanned',
    required: false,
  })
  reason?: string;
}

const MahoragaCommandDecorator = createCommandGroupDecorator({
  name: 'mahoraga',
  description: 'Mahoraga anti-spam commands',
  contexts: [InteractionContextType.Guild],
  defaultMemberPermissions: 'Administrator',
});

@MahoragaCommandDecorator()
@Injectable()
export class MahoragaCommand {
  constructor(private readonly mahoragaService: MahoragaService) {}

  @Subcommand({
    name: 'unban',
    description: 'Remove a user from Mahoraga softban',
  })
  async unban(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: MahoragaUnbanCommandDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await this.mahoragaService.pardonCase(
        dto.user.id,
        interaction.user.id,
        dto.reason,
      );
      const removed = result.results.filter(
        (entry) => entry.status === 'applied',
      ).length;
      await interaction.editReply({
        content: `<@${dto.user.id}> удалён из Mahoraga. Softban снят на ${removed} серверах.`,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        await interaction.editReply({
          content: `Для <@${dto.user.id}> нет записи Mahoraga.`,
        });
        return;
      }

      throw error;
    }
  }
}
