import { User } from 'discord.js';
import { UserOption } from 'necord';

export class BlacklistUserDto {
  @UserOption({
    name: 'user',
    description: 'Пользователь',
    required: true,
  })
  user: User;
}
