import {
  Entity,
  Enum,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

export enum GolderMediaStatus {
  Pending = 'pending',
  Ready = 'ready',
}

@Entity({ tableName: 'golder_media' })
export class GolderMediaEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ unique: true })
  slug: string;

  @Property({ type: 'jsonb' })
  tags: string[] = [];

  @Property({ type: 'bigint' })
  uploaded_by: bigint;

  @Property({ unique: true })
  object_key: string;

  @Enum({ items: () => GolderMediaStatus })
  status: GolderMediaStatus = GolderMediaStatus.Pending;

  @Property()
  content_type: string;

  @Property({ type: 'bigint' })
  size_bytes: bigint;
}
