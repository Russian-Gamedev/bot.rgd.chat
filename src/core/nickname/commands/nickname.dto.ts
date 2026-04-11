import { GuildMember } from 'discord.js';
import { MemberOption } from 'necord';

export class NicknameHistoryDto {
  @MemberOption({
    name: 'member',
    description: 'Участник',
    required: false,
  })
  member: GuildMember | null;
}
