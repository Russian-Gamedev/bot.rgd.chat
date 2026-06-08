import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

export enum ActivityPeriod {
  Day = 'day',
  Week = 'week',
  Month = 'month',
}

@Entity({ tableName: 'activities' })
export class ActivityEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint', index: true })
  guild_id: bigint;

  @Property({ type: 'bigint', index: true })
  user_id: bigint;

  @Property({ type: 'varchar', index: true })
  period: ActivityPeriod;

  @Property({ type: 'integer', defaultRaw: '0' })
  message: number;

  @Property({ type: 'integer', defaultRaw: '0' })
  voice: number;

  @Property({ type: 'integer', defaultRaw: '0' })
  reactions: number;
}
