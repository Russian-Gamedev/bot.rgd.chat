import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'wallets' })
export class WalletEntity extends BaseEntity {
  @PrimaryKey()
  @Property({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'bigint', default: 0 })
  coins = 0n;
}
