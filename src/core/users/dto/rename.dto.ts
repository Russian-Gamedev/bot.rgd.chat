import { GuildMember } from 'discord.js';
import { MemberOption, StringOption } from 'necord';

export class RenameUserDto {
  @MemberOption({
    name: 'member',
    description: 'кого переименовать',
    required: true,
  })
  member: GuildMember;
  @StringOption({
    name: 'new_name',
    description: 'Новое имя пользователя',
    required: true,
  })
  new_name: string;

  @StringOption({
    name: 'lock',
    description: 'Заблокировать никнейм (1000 монет/час)',
    required: false,
  })
  lock?: string;
}
