import { NumberOption } from 'necord';

export class DeletePortalDto {
  @NumberOption({
    name: 'id',
    description: 'ID портала для удаления',
    required: true,
  })
  id: number;
}
