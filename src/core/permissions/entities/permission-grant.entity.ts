import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';
import { ActorType, Permission } from '../permissions.types';

@Entity({ tableName: 'permission_grants' })
@Index({ properties: ['actorType', 'actorId'] })
@Index({ properties: ['guild_id'] })
export class PermissionGrantEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Enum({ items: () => ActorType, fieldName: 'actor_type' })
  actorType: ActorType;

  @Property({ type: 'bigint', fieldName: 'actor_id' })
  actorId: bigint;

  @Property({ type: 'bigint', nullable: true, default: null })
  guild_id: bigint | null = null;

  @Enum({ items: () => Permission })
  permission: Permission;
}
