import { StringOption } from 'necord';

export class CreatePortalDto {
  @StringOption({
    name: 'target_channel',
    description: 'ID целевого канала для связывания',
    required: true,
  })
  target_channel: string;
}
