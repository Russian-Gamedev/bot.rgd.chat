import { StringOption } from 'necord';

export class SetSettingDto<T> {
  @StringOption({
    name: 'key',
    description: 'The setting key to set',
    required: true,
    autocomplete: true,
  })
  key: string;

  @StringOption({
    name: 'value',
    description: 'The setting value to set',
    required: true,
  })
  value: T;
}
