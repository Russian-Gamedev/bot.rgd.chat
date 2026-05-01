import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'crosspost_deliveries' })
@Unique({
  name: 'crosspost_deliveries_route_target_source_message_unique',
  properties: ['routeId', 'targetId', 'sourceMessageId'],
})
export class CrossPostDeliveryEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'uuid', fieldName: 'route_id', index: true })
  routeId: string;

  @Property({ type: 'text', fieldName: 'target_id' })
  targetId: string;

  @Property({ type: 'text', fieldName: 'source_key', index: true })
  sourceKey: string;

  @Property({ type: 'text', fieldName: 'source_message_id' })
  sourceMessageId: string;

  @Property({ type: 'text', fieldName: 'target_message_id' })
  targetMessageId: string;

  @Property({
    type: 'timestamptz',
    fieldName: 'deleted_at',
    nullable: true,
    default: null,
  })
  deletedAt?: Date | null = null;
}
