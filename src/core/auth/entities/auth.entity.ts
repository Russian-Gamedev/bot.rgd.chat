import { Entity, PrimaryKey } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'auth' })
export class AuthEntity extends BaseEntity {
  @PrimaryKey({ type: 'bigint' })
  user_id: bigint;
}
