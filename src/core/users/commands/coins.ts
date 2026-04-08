import { NecordPaginationService, PageBuilder } from '@necord/pagination';
import { Injectable } from '@nestjs/common';
import { EmbedBuilder, MessageFlags } from 'discord.js';
import {
  Context,
  createCommandGroupDecorator,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord';

import {
  WalletTransactionEntity,
  WalletTransactionType,
} from '#core/wallet/entities/wallet-transaction.entity';
import { InsufficientFundsException } from '#core/wallet/wallet.exception';
import { WalletService } from '#core/wallet/wallet.service';
import { formatCoins } from '#root/lib/utils';

import { CoinHistoryDto, CoinTransferDto } from '../dto/coins.dto';
import { UserService } from '../users.service';

const CoinsGroupDecorator = createCommandGroupDecorator({
  name: 'coins',
  description: 'Центробанк РГД',
});

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
      await this.walletService.transfer(fromUser, toUser, amount, 'transfer');
    } catch (err) {
      if (err instanceof InsufficientFundsException) {
        return interaction.reply({
          content: 'У вас недостаточно монет для этого перевода.',
          flags: MessageFlags.Ephemeral,
        });
      }
      throw err;
    }

    return interaction.reply({
      content: `<@${interaction.user.id}> перевел ${formatCoins(amount)} монет пользователю <@${dto.target.user.id}>.`,
    });
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
