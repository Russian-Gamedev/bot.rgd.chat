import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'nickname_history' })
@Index({ properties: ['user_id', 'guild_id'] })
export class NicknameHistoryEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'bigint' })
  guild_id: bigint;

  @Property({ type: 'text', nullable: true })
  old_nickname: string | null;

  @Property({ type: 'text' })
  new_nickname: string;

  @Property({ type: 'bigint' })
  changed_by: bigint;
}
