import { Injectable } from '@nestjs/common';
import { InteractionContextType, MessageFlags } from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  Options,
  type SlashCommandContext,
  StringOption,
  Subcommand,
} from 'necord';

import { truncateText } from '#lib/utils';

import { GuildInviteService } from '../invite.service';

const MAX_DESCRIPTION_CHARS = 4096;

export const InvitesCommandDecorator = createCommandGroupDecorator({
  name: 'invites',
  description: 'Управление приглашениями',
  defaultMemberPermissions: 'Administrator',
  contexts: [InteractionContextType.Guild],
});

class InviteAliasSetDto {
  @StringOption({
    name: 'code',
    description: 'Код приглашения',
    required: true,
  })
  code: string;

  @StringOption({
    name: 'name',
    description: 'Alias приглашения (например, где оно размещено)',
    required: true,
  })
  name: string;
}

class InviteAliasClearDto {
  @StringOption({
    name: 'code',
    description: 'Код приглашения',
    required: true,
  })
  code: string;
}

@InvitesCommandDecorator({ name: 'alias', description: 'Alias приглашения' })
@Injectable()
export class InvitesAliasCommand {
  constructor(private readonly guildInviteService: GuildInviteService) {}

  @Subcommand({ name: 'set', description: 'Задать alias приглашения' })
  public async set(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: InviteAliasSetDto,
  ) {
    const invite = await this.guildInviteService.setAlias(dto.code, dto.name);
    if (!invite) {
      return await interaction.reply({
        content: `Приглашение \`${dto.code}\` не найдено.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    return await interaction.reply({
      content: `Alias приглашения \`${invite.id}\` установлен: **${invite.name}**.`,
      flags: [MessageFlags.Ephemeral],
    });
  }

  @Subcommand({ name: 'clear', description: 'Убрать alias приглашения' })
  public async clear(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: InviteAliasClearDto,
  ) {
    const invite = await this.guildInviteService.setAlias(dto.code, null);
    if (!invite) {
      return await interaction.reply({
        content: `Приглашение \`${dto.code}\` не найдено.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    return await interaction.reply({
      content: `Alias приглашения \`${invite.id}\` убран.`,
      flags: [MessageFlags.Ephemeral],
    });
  }
}

@InvitesCommandDecorator()
@Injectable()
export class InvitesListCommand {
  constructor(private readonly guildInviteService: GuildInviteService) {}

  @Subcommand({
    name: 'list',
    description: 'Список приглашений сервера',
  })
  public async list(@Context() [interaction]: SlashCommandContext) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const invites = await this.guildInviteService.listGuildInvites(
      interaction.guildId!,
    );
    if (invites.length === 0) {
      return await interaction.editReply({
        content: 'Приглашений не найдено.',
      });
    }

    const lines = invites.map((invite) => {
      const inviter = `<@${invite.inviter_id}>`;
      return invite.name
        ? `\`${invite.id}\` — ${invite.name} (uses: ${invite.uses}, ${inviter})`
        : `\`${invite.id}\` (uses: ${invite.uses}, ${inviter})`;
    });

    return await interaction.editReply({
      embeds: [
        {
          title: 'Приглашения сервера',
          description: truncateText(lines.join('\n'), MAX_DESCRIPTION_CHARS),
        },
      ],
    });
  }
}
