import { StringOption } from 'necord';

export class SetBirthdayDto {
  @StringOption({
    name: 'date',
    description: 'Дата рождения в формате ДД.ММ.ГГГГ или пусто для удаления',
  })
  date: string | null;
}
