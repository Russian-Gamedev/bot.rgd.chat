import { StringOption } from 'necord';

export class AddMotdDto {
  @StringOption({
    name: 'content',
    description: 'Текст MOTD. Рекомендуемая длина — 20 символов',
    required: true,
  })
  content: string;
}
