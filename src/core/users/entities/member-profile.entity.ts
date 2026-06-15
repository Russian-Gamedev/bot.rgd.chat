import {
  Entity,
  Index,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'guild_users' })
@Unique({ properties: ['user_id', 'guild_id'] })
@Index({ properties: ['user_id', 'guild_id'] })
export class MemberProfileEntity extends BaseEntity {
  @PrimaryKey({ type: 'bigint' })
  id: bigint;

  @Property({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'bigint' })
  guild_id: bigint;

  @Property({ type: 'text', nullable: true })
  nickname: string | null = null;

  @Property({ fieldName: 'avatar_url', type: 'text', nullable: true })
  avatar_url: string | null = null;

  @Property({ type: 'text', nullable: true })
  banner: string | null = null;

  @Property({ type: 'text', nullable: true })
  display_color: string | null = null;

  @Property({
    fieldName: 'first_joined_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  firstJoinedAt: Date;

  @Property({ fieldName: 'is_left_guild', type: 'boolean', default: false })
  isLeftGuild = false;

  @Property({ fieldName: 'left_at', type: 'timestamptz', nullable: true })
  leftAt: Date | null = null;

  @Property({ fieldName: 'left_count', type: 'integer', default: 0 })
  leftCount = 0;

  @Property({ fieldName: 'active_streak', type: 'integer', default: 0 })
  activeStreak = 0;

  @Property({
    fieldName: 'max_active_streak',
    type: 'integer',
    default: 0,
    onUpdate(entity: MemberProfileEntity) {
      if (entity.activeStreak > entity.maxActiveStreak) {
        entity.maxActiveStreak = entity.activeStreak;
      }
    },
  })
  maxActiveStreak = 0;
}
