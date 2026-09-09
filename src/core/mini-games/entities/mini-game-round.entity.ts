import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

export enum MiniGame {
  FLIP = 'flip',
  SLOT = 'slot',
  ROULETTE = 'roulette',
}

@Entity({ tableName: 'mini_game_rounds' })
@Index({ properties: ['guild_id', 'user_id'] })
@Index({ properties: ['game'] })
export class MiniGameRoundEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  guild_id: bigint;

  @Property({ type: 'bigint' })
  user_id: bigint;

  @Enum({ items: () => MiniGame })
  game: MiniGame;

  @Property({ type: 'bigint' })
  bet: bigint;

  /** Total coins credited back to the player, 0 on loss. */
  @Property({ type: 'bigint' })
  payout: bigint;

  @Property({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null = null;
}
