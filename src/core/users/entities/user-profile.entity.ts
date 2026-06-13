import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'users' })
export class UserProfileEntity extends BaseEntity {
  @PrimaryKey({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'text', defaultRaw: "''" })
  username: string;

  @Property({ type: 'text', nullable: true })
  nickname: string | null;

  @Property({ fieldName: 'avatar_url', type: 'text' })
  avatar_url: string;

  @Property({ type: 'text', nullable: true })
  banner: string | null;

  @Property({ type: 'text', nullable: true })
  banner_alt: string | null;

  @Property({ type: 'text', defaultRaw: "'#fff'" })
  banner_color = '#fff';

  @Property({
    fieldName: 'first_joined_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  firstJoinedAt: Date;

  @Property({ type: 'text', nullable: true })
  about: string | null;

  @Property({ fieldName: 'birth_date', type: 'timestamptz', nullable: true })
  birthDate: Date | null = null;

  @Property({ type: 'integer', default: 0 })
  reputation = 0;

  @Property({ type: 'integer', default: 0 })
  experience = 0;

  @Property({
    fieldName: 'last_active_at',
    type: 'timestamptz',
    defaultRaw: 'now()',
  })
  lastActiveAt: Date;

  @Property({ fieldName: 'active_streak', type: 'integer', default: 0 })
  activeStreak = 0;

  @Property({
    fieldName: 'max_active_streak',
    type: 'integer',
    default: 0,
    onUpdate(entity: UserProfileEntity) {
      if (entity.activeStreak > entity.maxActiveStreak) {
        entity.maxActiveStreak = entity.activeStreak;
      }
    },
  })
  maxActiveStreak = 0;
}
