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

import { EmojiCoin } from '#config/emojies';
import { GuildEvents, GuildSettings } from '#config/guilds';
import { GuildEventService } from '#core/guilds/events/guild-events.service';
import { GuildSettingsService } from '#core/guilds/settings/guild-settings.service';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import { WalletService } from '#core/wallet/wallet.service';
import { formatCoins, hideEmbedLink } from '#root/lib/utils';

import { RenameUserDto } from '../dto/rename.dto';
import { UserService } from '../users.service';

const RENAME_BOT_COST = 10_000n;

interface RenameResult {
  error: boolean;
  message: string;
  attachments?: string[];
}

@Injectable()
export class RenameCommands {
  constructor(
    private readonly guildSettingsService: GuildSettingsService,
    private readonly guildEventService: GuildEventService,
    private readonly walletService: WalletService,
    private readonly userService: UserService,
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

    const {
      error,
      message,
      attachments = [],
    } = await this.renameUser(
      interaction.member as GuildMember,
      target,
      new_name,
    );

    const attach = hideEmbedLink(attachments?.join('\n'));

    await interaction.reply({
      content: message + attach,
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

    const { message: replyMessage, attachments = [] } = await this.renameUser(
      message.member!,
      targetMember,
      new_nickname,
    );

    const attach = hideEmbedLink(attachments?.join('\n'));

    await message.reply({
      content: replyMessage + attach,
    });
  }

  private async renameUser(
    executor_member: GuildMember,
    target_member: GuildMember,
    new_nickname: string,
  ): Promise<RenameResult> {
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
      return this.renameBot(executor_member, target_member, new_nickname);
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

  private async renameBot(
    executor_member: GuildMember,
    target_member: GuildMember,
    new_nickname: string,
  ): Promise<RenameResult> {
    const user = await this.userService.findOrCreate(
      BigInt(executor_member.guild.id),
      BigInt(executor_member.id),
    );

    try {
      await this.walletService.debit(user, RENAME_BOT_COST, 'rename-bot', {
        new_nickname,
      });
    } catch (error) {
      if (error instanceof InsufficientFundsException) {
        return {
          error: true,
          message: `Недостаточно монет. Нужно: ${RENAME_BOT_COST}`,
        };
      }
      throw error;
    }

    try {
      await target_member.setNickname(
        new_nickname,
        `Renamed by ${executor_member.user.username} for ${formatCoins(RENAME_BOT_COST)} coins`,
      );
    } catch (error) {
      await this.walletService.credit(
        user,
        RENAME_BOT_COST,
        'rename-bot-refund',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {
        error: true,
        message: `Не удалось переименовать бота: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      error: false,
      message: `Бот переименован в \`${new_nickname}\` за ${formatCoins(RENAME_BOT_COST)} ${EmojiCoin.Animated}`,
      attachments: [
        'https://tenor.com/view/when-the-money-vince-mcmahon-big-chungus-wwe-gif-16018373',
      ],
    };
  }
}
