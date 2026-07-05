import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'user_profile_tags' })
@Index({ properties: ['user_id'] })
export class UserProfileTagEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'text' })
  name: string;

  @Property({ type: 'text' })
  color: string;

  @Property({ type: 'text' })
  background: string;

  @Property({ type: 'text' })
  description: string;
}
