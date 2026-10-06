import { Collection, type Rel } from '@mikro-orm/core';
import {
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

import {
  ProjectAttachmentType,
  ProjectAuthorType,
  ProjectReviewAction,
  ProjectRevisionStatus,
  ProjectType,
} from '../projects.types';

@Entity({ tableName: 'projects' })
export class ProjectEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  owner_id: bigint;

  @Property({ length: 160, unique: true })
  slug: string;

  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'published_revision_id',
    nullable: true,
    deleteRule: 'set null',
  })
  publishedRevision: Rel<ProjectRevisionEntity> | null = null;

  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'working_revision_id',
    nullable: true,
    deleteRule: 'set null',
  })
  workingRevision: Rel<ProjectRevisionEntity> | null = null;

  @OneToMany(
    () => ProjectRevisionEntity,
    (revision) => revision.project,
    {
      orphanRemoval: true,
    },
  )
  revisions = new Collection<ProjectRevisionEntity>(this);

  @OneToMany(
    () => ProjectLikeEntity,
    (like) => like.project,
    {
      orphanRemoval: true,
    },
  )
  likes = new Collection<ProjectLikeEntity>(this);

  @OneToMany(
    () => ProjectReviewEventEntity,
    (event) => event.project,
    {
      orphanRemoval: true,
    },
  )
  reviewEvents = new Collection<ProjectReviewEventEntity>(this);
}

@Entity({ tableName: 'project_revisions' })
@Unique({ properties: ['project', 'version'] })
@Index({ properties: ['status', 'updatedAt'] })
export class ProjectRevisionEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => ProjectEntity, {
    fieldName: 'project_id',
    deleteRule: 'cascade',
  })
  project: Rel<ProjectEntity>;

  @Property({ type: 'integer' })
  version: number;

  @Enum({ items: () => ProjectRevisionStatus })
  status = ProjectRevisionStatus.Draft;

  @Property({ length: 120 })
  title: string;

  @Property({ type: 'text' })
  description: string;

  @Property({ type: 'date', index: true })
  release_date: string;

  @Enum({ items: () => ProjectType })
  type = ProjectType.Game;

  @Property({ length: 100, nullable: true })
  promo: string | null = null;

  @Property({ type: 'boolean', default: false })
  hide_owner = false;

  @Property({ type: 'bigint' })
  created_by: bigint;

  @Property({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  published_at: Date | null = null;

  @OneToMany(
    () => ProjectAuthorEntity,
    (author) => author.revision,
    {
      orphanRemoval: true,
    },
  )
  authors = new Collection<ProjectAuthorEntity>(this);

  @OneToMany(
    () => ProjectRevisionTagEntity,
    (link) => link.revision,
    {
      orphanRemoval: true,
    },
  )
  tagLinks = new Collection<ProjectRevisionTagEntity>(this);

  @OneToMany(
    () => ProjectLinkEntity,
    (link) => link.revision,
    {
      orphanRemoval: true,
    },
  )
  links = new Collection<ProjectLinkEntity>(this);

  @OneToMany(
    () => ProjectAttachmentEntity,
    (attachment) => attachment.revision,
    {
      orphanRemoval: true,
    },
  )
  attachments = new Collection<ProjectAttachmentEntity>(this);
}

@Entity({ tableName: 'project_authors' })
@Unique({ properties: ['revision', 'position'] })
export class ProjectAuthorEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: ProjectRevisionEntity;

  @Enum({ items: () => ProjectAuthorType })
  type: ProjectAuthorType;

  @Property({ type: 'bigint', nullable: true })
  discord_user_id: bigint | null = null;

  @Property({ length: 120, nullable: true })
  name: string | null = null;

  @Property({ length: 80 })
  role: string;

  @Property({ type: 'smallint' })
  position: number;
}

@Entity({ tableName: 'project_tags' })
export class ProjectTagEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ length: 64, unique: true })
  slug: string;

  @Property({ length: 80, unique: true })
  name: string;

  @OneToMany(
    () => ProjectRevisionTagEntity,
    (link) => link.tag,
  )
  revisionLinks = new Collection<ProjectRevisionTagEntity>(this);
}

@Entity({ tableName: 'project_revision_tags' })
export class ProjectRevisionTagEntity {
  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'revision_id',
    primary: true,
    deleteRule: 'cascade',
  })
  revision: ProjectRevisionEntity;

  @ManyToOne(() => ProjectTagEntity, {
    fieldName: 'tag_id',
    primary: true,
    deleteRule: 'restrict',
  })
  tag: ProjectTagEntity;
}

@Entity({ tableName: 'project_links' })
@Unique({ properties: ['revision', 'position'] })
export class ProjectLinkEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: ProjectRevisionEntity;

  @Property({ length: 64 })
  icon: string;

  @Property({ length: 80 })
  label: string;

  @Property({ length: 2048 })
  link: string;

  @Property({ type: 'smallint' })
  position: number;
}

@Entity({ tableName: 'project_attachments' })
@Unique({ properties: ['revision', 'position'] })
export class ProjectAttachmentEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: ProjectRevisionEntity;

  @Enum({ items: () => ProjectAttachmentType })
  type: ProjectAttachmentType;

  @Property({ length: 2048 })
  url: string;

  @Property({ type: 'smallint' })
  position: number;
}

@Entity({ tableName: 'project_likes' })
@Index({ properties: ['user_id', 'created_at'] })
export class ProjectLikeEntity {
  @ManyToOne(() => ProjectEntity, {
    fieldName: 'project_id',
    primary: true,
    deleteRule: 'cascade',
  })
  project: ProjectEntity;

  @PrimaryKey({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  created_at = new Date();
}

@Entity({ tableName: 'project_review_events' })
export class ProjectReviewEventEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => ProjectEntity, {
    fieldName: 'project_id',
    deleteRule: 'cascade',
  })
  project: ProjectEntity;

  @ManyToOne(() => ProjectRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: ProjectRevisionEntity;

  @Enum({ items: () => ProjectReviewAction })
  action: ProjectReviewAction;

  @Property({ type: 'bigint' })
  actor_id: bigint;

  @Property({ type: 'text', nullable: true })
  comment: string | null = null;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  created_at = new Date();
}
