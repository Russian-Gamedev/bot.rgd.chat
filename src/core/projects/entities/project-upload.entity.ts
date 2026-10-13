import {
  Entity,
  Enum,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

import { ProjectUploadKind, ProjectUploadStatus } from '../projects.types';

@Entity({ tableName: 'project_uploads' })
export class ProjectUploadEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  owner_id: bigint;

  @Enum({ items: () => ProjectUploadKind })
  kind: ProjectUploadKind;

  @Property({ unique: true })
  object_key: string;

  @Enum({ items: () => ProjectUploadStatus })
  status: ProjectUploadStatus = ProjectUploadStatus.Pending;

  @Property()
  content_type: string;

  @Property({ type: 'bigint' })
  size_bytes: bigint;
}
