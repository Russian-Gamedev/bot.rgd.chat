import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';
import { type DiscordID } from '#root/lib/types';

@Entity({ tableName: 'patrons_history' })
@Index({ properties: ['user_id'] })
export class PatronHistoryEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint' })
  user_id: DiscordID;

  @Property({ type: 'double precision' })
  value: number;
}
