import { NecordPaginationService, PageBuilder } from '@necord/pagination';
import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import {
  Button,
  type ButtonContext,
  Context,
  createCommandGroupDecorator,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord';
import { EmojiCoin } from '#config/emojies';
import { UserService } from '#core/users/users.service';
import {
  WalletTransactionEntity,
  WalletTransactionType,
} from '#core/wallet/entities/wallet-transaction.entity';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import { WalletService } from '#core/wallet/wallet.service';
import { formatCoins } from '#lib/utils';

import {
  CoinHistoryDto,
  CoinRequestDto,
  CoinTransferDto,
} from '../dto/coins.dto';

const CoinsGroupDecorator = createCommandGroupDecorator({
  name: 'coins',
  description: 'Центробанк РГД',
});

const REQUEST_BUTTON_ROUTE =
  'coins_request/:action/:requesterId/:targetId/:value';
const REQUEST_BUTTON_PATTERN =
  /^coins_request\/(accept|decline)\/(\d+)\/(\d+)\/(\d+)$/;

type RequestButtonPayload = {
  action: 'accept' | 'decline';
  requesterId: string;
  targetId: string;
  value: bigint;
};

function buildRequestButtons(
  requesterId: string,
  targetId: string,
  value: bigint,
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`coins_request/accept/${requesterId}/${targetId}/${value}`)
      .setLabel('Перевести')
      .setEmoji('💸')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`coins_request/decline/${requesterId}/${targetId}/${value}`)
      .setLabel('Отказаться')
      .setEmoji('🚫')
      .setStyle(ButtonStyle.Danger),
  );
  return [row];
}

function parseRequestButtons(customId: string): RequestButtonPayload | null {
  const found = REQUEST_BUTTON_PATTERN.exec(customId);
  if (!found) return null;

  const [, action, requesterId, targetId, value] = found;
  return {
    action: action as 'accept' | 'decline',
    requesterId,
    targetId,
    value: BigInt(value),
  };
}

@CoinsGroupDecorator()
@Injectable()
export class CoinsCommand {
  constructor(
    private readonly userService: UserService,
    private readonly walletService: WalletService,
    private readonly paginationService: NecordPaginationService,
  ) {}

  @Subcommand({
    name: 'transfer',
    description: 'Перевести монеты другому пользователю',
  })
  async transfer(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: CoinTransferDto,
  ) {
    if (!interaction.guild) return;

    const fromUser = await this.userService.findOrCreate(
      interaction.guild.id,
      interaction.user.id,
    );
    const toUser = await this.userService.findOrCreate(
      interaction.guild.id,
      dto.target.id,
    );
    const amount = BigInt(Math.floor(Number(dto.amount)));

    if (amount <= 0n) {
      return interaction.reply({
        content: 'Сумма перевода должна быть положительным числом.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await this.walletService.transfer(
        fromUser.user_id,
        toUser.user_id,
        amount,
        'transfer',
        { guildId: fromUser.guild_id },
      );
    } catch (err) {
      if (err instanceof InsufficientFundsException) {
        return interaction.reply({
          content: 'У вас недостаточно монет для этого перевода.',
          flags: MessageFlags.Ephemeral,
        });
      }
      throw err;
    }

    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setDescription(
        `<@${interaction.user.id}> перевёл ${formatCoins(amount)} ${EmojiCoin.Bottom} монет пользователю <@${dto.target.id}>.`,
      );

    return interaction.reply({ embeds: [embed] });
  }

  @Subcommand({
    name: 'request',
    description: 'Запросить монеты у другого пользователя',
  })
  async request(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: CoinRequestDto,
  ) {
    if (!interaction.guild) return;

    if (dto.member.user.bot) {
      return interaction.reply({
        content: 'Нельзя запросить монеты у бота.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (dto.member.id === interaction.user.id) {
      return interaction.reply({
        content: 'Нельзя запросить монеты у себя.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const value = BigInt(dto.value);

    const embed = new EmbedBuilder()
      .setColor('#FF9900')
      .setDescription(
        `<@${dto.member.id}>, <@${interaction.user.id}> запрашивает у вас ${formatCoins(value)} ${EmojiCoin.Bottom} монет.`,
      );

    return interaction.reply({
      embeds: [embed],
      components: buildRequestButtons(
        interaction.user.id,
        dto.member.id,
        value,
      ),
    });
  }

  @Button(REQUEST_BUTTON_ROUTE)
  async respondToRequest(@Context() [interaction]: ButtonContext) {
    const payload = parseRequestButtons(interaction.customId);
    if (!payload) return;

    if (payload.targetId !== interaction.user.id) {
      return interaction.reply({
        content: 'Этот запрос адресован не вам.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (payload.action === 'decline') {
      const embed = new EmbedBuilder()
        .setColor('#ff2f00')
        .setDescription(
          `❌ <@${payload.targetId}> отклонил запрос <@${payload.requesterId}> на ${formatCoins(payload.value)} монет.`,
        );
      return interaction.update({ embeds: [embed], components: [] });
    }

    try {
      await this.walletService.transfer(
        payload.targetId,
        payload.requesterId,
        payload.value,
        'request',
        { guildId: interaction.guild?.id },
      );
    } catch (err) {
      if (err instanceof InsufficientFundsException) {
        return interaction.reply({
          content: 'У вас недостаточно монет для этого перевода.',
          flags: MessageFlags.Ephemeral,
        });
      }
      throw err;
    }

    const embed = new EmbedBuilder()
      .setColor('#5fdb00')
      .setDescription(
        `✅ <@${payload.targetId}> перевёл ${formatCoins(payload.value)} ${EmojiCoin.Bottom} монет <@${payload.requesterId}>.`,
      );
    return interaction.update({ embeds: [embed], components: [] });
  }

  @Subcommand({
    name: 'history',
    description: 'Просмотреть историю переводов',
  })
  async history(
    @Context() [interaction]: SlashCommandContext,
    @Options() dto: CoinHistoryDto,
  ) {
    if (!interaction.guild) return;

    const targetId = dto.target?.id ?? interaction.user.id;
    const targetMention = `<@${targetId}>`;
    const targetMember = interaction.guild.members.cache.get(targetId);
    const targetName = targetMember ? targetMember.displayName : targetMention;

    const txs = await this.walletService.getHistory(
      targetId,
      interaction.guild.id,
      { limit: 100 },
    );

    if (txs.length === 0) {
      return interaction.reply({
        content: `У ${targetMention} нет истории транзакций.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    const PAGE_SIZE = 10;
    const pages: PageBuilder[] = [];

    for (let i = 0; i < txs.length; i += PAGE_SIZE) {
      const chunk = txs.slice(i, i + PAGE_SIZE);
      const totalPages = Math.ceil(txs.length / PAGE_SIZE);
      const pageNum = Math.floor(i / PAGE_SIZE) + 1;

      const embed = new EmbedBuilder()
        .setTitle(`История транзакций ${targetName}`)
        .setColor('#FF9900')
        .setFooter({
          text: `Страница ${pageNum}/${totalPages} · Всего: ${txs.length}`,
        })
        .setDescription(chunk.map((tx) => this.formatTx(tx)).join('\n'));

      pages.push(new PageBuilder().setEmbeds([embed]));
    }

    const customId = `coins_history_${interaction.user.id}_${Date.now()}`;
    const pagination = this.paginationService.create((builder) =>
      builder.setCustomId(customId).setPages(pages),
    );

    const page = await pagination.build();
    return interaction.editReply(page);
  }

  private formatTx(tx: WalletTransactionEntity): string {
    const date = tx.createdAt.toLocaleDateString('ru-RU');
    const time = tx.createdAt.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const typeLabels: Record<WalletTransactionType, string> = {
      [WalletTransactionType.CREDIT]: '📈 Получено',
      [WalletTransactionType.DEBIT]: '📉 Списано',
      [WalletTransactionType.TRANSFER_IN]: '⬅️ Перевод входящий',
      [WalletTransactionType.TRANSFER_OUT]: '➡️ Перевод исходящий',
    };

    const label = typeLabels[tx.type];
    const amount = formatCoins(tx.amount);
    const balance = formatCoins(tx.balance_after);
    const counterpart = tx.related_user_id ? ` · <@${tx.related_user_id}>` : '';
    const reason = tx.reason ? ` · \`${tx.reason}\`` : '';

    return `\`${date} ${time}\` **${label}** ${amount}${counterpart}${reason} → баланс: **${balance}**`;
  }
}
