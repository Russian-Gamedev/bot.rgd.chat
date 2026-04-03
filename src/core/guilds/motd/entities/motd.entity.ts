import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

@Entity({ tableName: 'guild_motds' })
export class MotdEntity extends BaseEntity {
  @PrimaryKey()
  id: number;

  @Property({ type: 'bigint', nullable: true })
  author_id?: bigint;

  @Property()
  content: string;
}
