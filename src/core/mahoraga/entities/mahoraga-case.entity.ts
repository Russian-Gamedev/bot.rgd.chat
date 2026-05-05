import {
  Entity,
  Enum,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

import type { MahoragaEvidence } from '../mahoraga.types';
import { MahoragaCaseStatus, MahoragaReason } from '../mahoraga.types';

@Entity({ tableName: 'mahoraga_cases' })
@Unique({ properties: ['user_id'] })
@Index({ properties: ['status'] })
@Index({ properties: ['source_guild_id'] })
@Index({ properties: ['reason'] })
export class MahoragaCaseEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  user_id: bigint;

  @Enum({ items: () => MahoragaCaseStatus })
  status: MahoragaCaseStatus = MahoragaCaseStatus.Active;

  @Enum({ items: () => MahoragaReason })
  reason: MahoragaReason = MahoragaReason.Manual;

  @Property({ type: 'bigint', nullable: true })
  source_guild_id: bigint | null = null;

  @Property({ type: 'bigint', nullable: true })
  source_channel_id: bigint | null = null;

  @Property({ type: 'bigint', nullable: true })
  source_message_id: bigint | null = null;

  @Property({ type: 'text', nullable: true })
  matched_value: string | null = null;

  @Property({ type: 'jsonb', defaultRaw: "'[]'::jsonb" })
  evidence: MahoragaEvidence[] = [];

  @Property({ type: 'integer', default: 0 })
  detection_count = 0;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  detected_at = new Date();

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  last_detected_at = new Date();

  @Property({ type: 'text', nullable: true, unique: true })
  verification_token: string | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  verification_expires_at: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  pardoned_at: Date | null = null;

  @Property({ type: 'bigint', nullable: true })
  pardoned_by: bigint | null = null;

  @Property({ type: 'text', nullable: true })
  pardon_reason: string | null = null;
}
