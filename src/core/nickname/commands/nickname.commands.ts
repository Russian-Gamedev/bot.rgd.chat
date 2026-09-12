import { EmbedBuilder } from '@discordjs/builders';
import { Injectable } from '@nestjs/common';
import { GuildMember, InteractionContextType, MessageFlags } from 'discord.js';
import {
  Context,
  Options,
  SlashCommand,
  type SlashCommandContext,
} from 'necord';

import { Emojis } from '#config/emojis';
import { UserService } from '#core/users/users.service';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import { WalletService } from '#core/wallet/wallet.service';
import { formatCoins } from '#lib/utils';

import { NicknameService } from '../nickname.service';

import { NicknameHistoryDto, UnlockNicknameDto } from './nickname.dto';

const UNLOCK_COST_MULTIPLIER = 10n;

@Injectable()
export class NicknameCommands {
  constructor(
    private readonly nicknameService: NicknameService,
    private readonly userService: UserService,
    private readonly walletService: WalletService,
  ) {}

  @SlashCommand({
    name: 'nickhistory',
    description: 'Показать историю никнеймов участника',
    contexts: [InteractionContextType.Guild],
  })
  async nickhistory(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: NicknameHistoryDto,
  ) {
    const guild = interaction.guild;
    if (!guild) return;

    const target = dto.member ?? (interaction.member as GuildMember | null);
    if (!target) return;

    const userId = BigInt(target.id);
    const guildId = BigInt(guild.id);

    const history = await this.nicknameService.getHistory(guildId, userId, 10);

    if (!history.length) {
      return interaction.reply({
        content: 'История никнеймов пуста',
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x3b5998)
      .setTitle(
        `История никнеймов: ${target.displayName ?? target.user.username}`,
      );

    const fields = history.map((h) => {
      const date = new Date(h.createdAt).toLocaleString('ru', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return {
        name: date,
        value: `**${h.old_nickname ?? '(username)'}** → **${h.new_nickname}**`,
        inline: false,
      };
    });

    embed.setFields(fields);

    return interaction.reply({ embeds: [embed] });
  }

  @SlashCommand({
    name: 'rn-unlock',
    description: 'Снять блокировку никнейма за десятикратную её стоимость',
    contexts: [InteractionContextType.Guild],
  })
  async unlock(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: UnlockNicknameDto,
  ) {
    const guild = interaction.guild;
    if (!guild) return;

    const target = dto.member;
    const guildId = BigInt(guild.id);
    const userId = BigInt(target.id);

    const lock = await this.nicknameService.getLockInfo(guildId, userId);
    if (!lock) {
      return interaction.reply({
        content: `У <@${target.id}> нет заблокированного никнейма`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const unlockCost = lock.cost * UNLOCK_COST_MULTIPLIER;
    const user = await this.userService.findOrCreate(
      guild.id,
      interaction.user.id,
    );

    try {
      await this.walletService.debit(
        user.user_id,
        unlockCost,
        'unlock-nickname',
        {
          guildId: user.guild_id,
          metadata: { target_id: userId, lock_cost: lock.cost },
        },
      );
    } catch (error) {
      if (error instanceof InsufficientFundsException) {
        return interaction.reply({
          content: `Недостаточно монет для снятия блокировки. Нужно: ${formatCoins(unlockCost)} ${Emojis.CoinAnimated}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      throw error;
    }

    await this.nicknameService.clearLockedNickname(guildId, userId);

    const expiresAt = lock.expiresAt ? ` (до <t:${lock.expiresAt}:R>)` : '';

    return interaction.reply({
      content: `<@${interaction.user.id}> снял блокировку никнейма <@${target.id}>${expiresAt} за ${formatCoins(unlockCost)} ${Emojis.CoinAnimated}`,
    });
  }
}
