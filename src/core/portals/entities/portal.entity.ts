import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'portals' })
@Index({ properties: ['channel_a_id'] })
@Index({ properties: ['channel_b_id'] })
export class PortalEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint' })
  guild_a_id: bigint;

  @Property({ type: 'bigint' })
  guild_b_id: bigint;

  @Property({ type: 'bigint' })
  channel_a_id: bigint;

  @Property({ type: 'bigint' })
  channel_b_id: bigint;

  @Property()
  webhook_a_id: string;

  @Property()
  webhook_a_token: string;

  @Property()
  webhook_b_id: string;

  @Property()
  webhook_b_token: string;

  @Property({ type: 'bigint' })
  created_by: bigint;
}
