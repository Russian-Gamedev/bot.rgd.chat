import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';

@Entity({ tableName: 'auth' })
@Unique({ properties: ['guild_id', 'user'] })
export class AuthEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint' })
  guild_id: bigint;

  @ManyToOne(() => UserProfileEntity, {
    deleteRule: 'CASCADE',
    type: 'bigint',
  })
  user: UserProfileEntity;
}
