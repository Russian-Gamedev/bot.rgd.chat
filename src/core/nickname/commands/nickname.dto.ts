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

export class UnlockNicknameDto {
  @MemberOption({
    name: 'member',
    description: 'Участник, с которого снять блокировку никнейма',
    required: true,
  })
  member: GuildMember;
}
