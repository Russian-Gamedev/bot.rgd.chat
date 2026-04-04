import { Injectable } from '@nestjs/common';
import { GuildMember, InteractionContextType, MessageFlags } from 'discord.js';
import {
  Arguments,
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
  TextCommand,
  type TextCommandContext,
} from 'necord';

import { GuildEvents, GuildSettings } from '#config/guilds';
import { GuildEventService } from '#core/guilds/events/guild-events.service';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';

import { RenameUserDto } from '../dto/rename.dto';

@Injectable()
export class RenameCommands {
  constructor(
    private readonly guildSettingsService: GuildSettingsService,
    private readonly guildEventService: GuildEventService,
  ) {}

  @SlashCommand({
    name: 'rn',
    description: 'Rename a user',
    contexts: [InteractionContextType.Guild],
  })
  async renameUserSlashCommand(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: RenameUserDto,
  ) {
    const target = dto.member;
    const new_name = dto.new_name;

    const { error, message } = await this.renameUser(
      interaction.member as GuildMember,
      target,
      new_name,
    );

    await interaction.reply({
      content: message,
      flags: error ? MessageFlags.Ephemeral : undefined,
    });
  }

  @TextCommand({
    name: 'rn',
    description: 'Rename a user',
  })
  async renameUserTextCommand(
    @Context() [message]: TextCommandContext,
    @Arguments() args: string[],
  ) {
    if (!message.guild) return;

    const target = message.mentions.members?.first();
    if (!target) return;

    const new_nickname = args.slice(1).join(' ');
    if (!new_nickname) {
      await message.reply({
        content: 'Укажите новое имя',
      });
      return;
    }

    const targetMember = await message.guild.members.fetch(target);

    const { message: replyMessage } = await this.renameUser(
      message.member!,
      targetMember,
      new_nickname,
    );

    await message.reply({
      content: replyMessage,
    });
  }

  private async renameUser(
    executor_member: GuildMember,
    target_member: GuildMember,
    new_nickname: string,
  ) {
    const guild = executor_member.guild;
    if (!guild) {
      throw new Error('Guild not found');
    }

    const activeRoleId = await this.guildSettingsService.getSetting<string>(
      BigInt(guild.id),
      GuildSettings.ActiveRoleId,
    );
    if (!activeRoleId) {
      return {
        error: true,
        message: 'Такой роли нет, которая требуется ... что?',
      };
    }

    if (!executor_member.roles.cache.has(activeRoleId)) {
      return {
        error: true,
        message: `У вас нет роли <@&${activeRoleId}>`,
      };
    }

    if (target_member.id === guild.client.user.id) {
      /// TODO rename bot by coins
    }

    if (target_member.id === guild.ownerId) {
      return {
        error: false,
        message: `<@${executor_member.id}> пытался переименовать <@${guild.ownerId}> в \`${new_nickname}\`, но у него не получилось.`,
      };
    }

    const previous_nickname =
      target_member.nickname ?? target_member.user.username;

    let message = await this.guildEventService.getRandom(
      BigInt(guild.id),
      GuildEvents.MEMBER_SET_NAME,
      {
        user: `**${previous_nickname}**`,
        nickname: `**${new_nickname}**`,
      },
    );

    message ??= `Пользователь ${previous_nickname} теперь ${new_nickname}`;

    try {
      await target_member.setNickname(
        new_nickname,
        `${message}. By ${executor_member.user.username}`,
      );
    } catch (error) {
      if (error instanceof Error) {
        return {
          error: true,
          message: `Не удалось переименовать пользователя: ${error.message}`,
        };
      }
    }

    return {
      error: false,
      message,
    };
  }
}
