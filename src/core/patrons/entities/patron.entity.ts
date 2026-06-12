import {
  Entity,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';
import { type DiscordID } from '#root/lib/types';

@Entity({ tableName: 'patrons' })
@Unique({ properties: ['user_id'] })
@Index({ properties: ['user_id'] })
export class PatronEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint' })
  user_id: DiscordID;

  @Property({ type: 'double precision', default: 0 })
  value = 0;
}
