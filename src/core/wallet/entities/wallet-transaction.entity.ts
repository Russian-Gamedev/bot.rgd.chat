import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

export enum WalletTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
}

@Entity({ tableName: 'wallet_transactions' })
@Index({ properties: ['user_id', 'guild_id'] })
@Index({ properties: ['type'] })
export class WalletTransactionEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'bigint' })
  guild_id: bigint;

  @Property({ type: 'bigint' })
  amount: bigint;

  @Property({ type: 'bigint' })
  balance_after: bigint;

  @Enum({ items: () => WalletTransactionType })
  type: WalletTransactionType;

  @Property({ type: 'text', nullable: true })
  reason: string | null = null;

  @Property({ type: 'bigint', nullable: true })
  related_user_id: bigint | null = null;

  @Property({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null = null;
}
