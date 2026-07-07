import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'user_activity_daily' })
export class UserActivityDailyEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'date', index: true })
  date: string;

  @Property({ type: 'bigint', index: true })
  user_id: bigint;

  @Property({ type: 'bigint', nullable: true, index: true })
  guild_id: bigint | null = null;

  @Property({ type: 'integer', defaultRaw: '0' })
  message_score = 0;

  @Property({ type: 'bigint', defaultRaw: '0' })
  voice_seconds = 0;

  @Property({ type: 'integer', defaultRaw: '0' })
  reaction_count = 0;
}
