import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'portal_blacklist' })
export class PortalBlacklistEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint', unique: true })
  user_id: bigint;
}
