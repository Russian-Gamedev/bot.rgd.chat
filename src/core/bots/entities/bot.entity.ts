import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import { Exclude } from 'class-transformer';

import { BaseEntity } from '#common/entities/base.entity';
import { Permission } from '#core/permissions/permissions.types';

@Entity({ tableName: 'bots' })
export class BotEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ unique: true })
  name: string;

  @Property({ type: 'bigint' })
  ownerId: bigint;

  @Property({ type: 'bigint', fieldName: 'bot_user_id', nullable: true })
  botUserId: bigint | null = null;

  @Property({ type: 'array', default: [], fieldName: 'scopes' })
  permissions: Permission[];

  @Property()
  @Exclude()
  tokenHash: string;

  @Property({ type: 'time with time zone', nullable: true, default: null })
  lastUsedAt?: Date;
}
