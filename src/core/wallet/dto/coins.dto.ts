import { GuildMember } from 'discord.js';
import { IntegerOption, MemberOption, NumberOption } from 'necord';

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

export class CoinRequestDto {
  @MemberOption({
    name: 'member',
    description: 'У кого запросить монеты',
    required: true,
  })
  member: GuildMember;

  @IntegerOption({
    name: 'value',
    description: 'Количество монет для запроса',
    required: true,
    min_value: 1,
  })
  value: number;
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
