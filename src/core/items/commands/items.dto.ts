import { GuildMember, type HexColorString } from 'discord.js';
import { BooleanOption, MemberOption, StringOption } from 'necord';

import { formatCoins } from '#root/lib/utils';

import { ItemRarity } from '../entities/item.entity';

export const ItemCostMap: Record<string, bigint> = {
  [ItemRarity.COMMON]: 50_000n,
  [ItemRarity.UNCOMMON]: 100_000n,
  [ItemRarity.RARE]: 200_000n,
  [ItemRarity.EPIC]: 500_000n,
  [ItemRarity.LEGENDARY]: 1_000_000n,
};

export class ItemListDto {
  @MemberOption({
    name: 'user',
    description: 'The user to list items for',
    required: false,
  })
  user: GuildMember;
}

export class CreateItemDto {
  @StringOption({
    name: 'name',
    description: 'Название предмета',
    required: true,
  })
  name: string;

  @StringOption({
    name: 'description',
    description: 'Описание предмета',
    required: true,
  })
  description: string;

  @StringOption({
    name: 'color',
    description: 'HEX цвет предмета',
    required: true,
  })
  color: HexColorString;

  @StringOption({
    name: 'image',
    description: 'Ссылка на изображение предмета',
    required: false,
  })
  image: string;

  @StringOption({
    name: 'rare',
    description: 'Редкость предмета',
    required: false,
    choices: Object.values(ItemRarity).map((value) => ({
      name: `${value} - Стоимость: ${formatCoins(ItemCostMap[value])} монет`,
      value: value,
    })),
  })
  rare: string;

  @BooleanOption({
    name: 'transferable',
    description: 'Передаваемый предмет?',
    required: false,
  })
  transferable: boolean;

  @MemberOption({
    name: 'user',
    description: 'Кому выдать предмет',
    required: false,
  })
  user: GuildMember;
}
