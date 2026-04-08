import { GuildMember } from 'discord.js';
import { MemberOption, NumberOption } from 'necord';

export class CoinTransferDto {
  @MemberOption({
    name: 'target',
    description: 'Кому перевести монеты',
    required: true,
  })
  target: GuildMember;

  @NumberOption({
    name: 'amount',
    description: 'Количество монет для перевода',
    required: true,
  })
  amount: number;
}

export class CoinHistoryDto {
  @MemberOption({
    name: 'target',
    description:
      'Пользователь, историю которого посмотреть (по умолчанию — вы)',
    required: false,
  })
  target: GuildMember | null;
}
