import { Injectable } from '@nestjs/common';
import { GuildMember, Message, User } from 'discord.js';
import {
  Context,
  MessageCommand,
  type MessageCommandContext,
  Options,
  SlashCommand,
  TargetMessage,
  type UserCommandContext,
} from 'necord';

import { cast, getDisplayAvatar } from '#lib/utils';

import { MemberDto } from './user.dto';

@Injectable()
export class UserUtilsCommand {
  @MessageCommand({ name: 'Get User Avatar' })
  public async getUserAvatarFromMessage(
    @Context() [interaction]: MessageCommandContext,
    @TargetMessage() message: Message,
  ) {
    return interaction.reply({
      content: getDisplayAvatar(message.member ?? message.author),
    });
  }

  @SlashCommand({ name: 'avatar', description: "Get user's avatar" })
  public async getUserAvatarFromCommand(
    @Context() [interaction]: UserCommandContext,
    @Options() dto: MemberDto,
  ) {
    const target = cast<GuildMember | User>(
      dto.member ?? interaction.member ?? interaction.user,
    );

    return interaction.reply({
      content: getDisplayAvatar(target, dto.extension),
    });
  }
}
