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
  GameAttachmentType,
  GameAuthorType,
  GameReviewAction,
  GameRevisionStatus,
} from '../games.types';

@Entity({ tableName: 'games' })
export class GameEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'bigint' })
  owner_id: bigint;

  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'published_revision_id',
    nullable: true,
    deleteRule: 'set null',
  })
  publishedRevision: Rel<GameRevisionEntity> | null = null;

  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'working_revision_id',
    nullable: true,
    deleteRule: 'set null',
  })
  workingRevision: Rel<GameRevisionEntity> | null = null;

  @OneToMany(
    () => GameRevisionEntity,
    (revision) => revision.game,
    {
      orphanRemoval: true,
    },
  )
  revisions = new Collection<GameRevisionEntity>(this);

  @OneToMany(
    () => GameLikeEntity,
    (like) => like.game,
    {
      orphanRemoval: true,
    },
  )
  likes = new Collection<GameLikeEntity>(this);

  @OneToMany(
    () => GameReviewEventEntity,
    (event) => event.game,
    {
      orphanRemoval: true,
    },
  )
  reviewEvents = new Collection<GameReviewEventEntity>(this);
}

@Entity({ tableName: 'game_revisions' })
@Unique({ properties: ['game', 'version'] })
@Index({ properties: ['status', 'updatedAt'] })
export class GameRevisionEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => GameEntity, { fieldName: 'game_id', deleteRule: 'cascade' })
  game: Rel<GameEntity>;

  @Property({ type: 'integer' })
  version: number;

  @Enum({ items: () => GameRevisionStatus })
  status = GameRevisionStatus.Draft;

  @Property({ length: 120 })
  title: string;

  @Property({ type: 'text' })
  description: string;

  @Property({ type: 'date', index: true })
  release_date: string;

  @Property({ type: 'bigint' })
  created_by: bigint;

  @Property({ type: 'timestamptz', nullable: true })
  submitted_at: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  published_at: Date | null = null;

  @OneToMany(
    () => GameAuthorEntity,
    (author) => author.revision,
    {
      orphanRemoval: true,
    },
  )
  authors = new Collection<GameAuthorEntity>(this);

  @OneToMany(
    () => GameRevisionTagEntity,
    (link) => link.revision,
    {
      orphanRemoval: true,
    },
  )
  tagLinks = new Collection<GameRevisionTagEntity>(this);

  @OneToMany(
    () => GameLinkEntity,
    (link) => link.revision,
    {
      orphanRemoval: true,
    },
  )
  links = new Collection<GameLinkEntity>(this);

  @OneToMany(
    () => GameAttachmentEntity,
    (attachment) => attachment.revision,
    {
      orphanRemoval: true,
    },
  )
  attachments = new Collection<GameAttachmentEntity>(this);
}

@Entity({ tableName: 'game_authors' })
@Unique({ properties: ['revision', 'position'] })
export class GameAuthorEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: GameRevisionEntity;

  @Enum({ items: () => GameAuthorType })
  type: GameAuthorType;

  @Property({ type: 'bigint', nullable: true })
  discord_user_id: bigint | null = null;

  @Property({ length: 120, nullable: true })
  name: string | null = null;

  @Property({ type: 'smallint' })
  position: number;
}

@Entity({ tableName: 'game_tags' })
export class GameTagEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ length: 64, unique: true })
  slug: string;

  @Property({ length: 80, unique: true })
  name: string;

  @OneToMany(
    () => GameRevisionTagEntity,
    (link) => link.tag,
  )
  revisionLinks = new Collection<GameRevisionTagEntity>(this);
}

@Entity({ tableName: 'game_revision_tags' })
export class GameRevisionTagEntity {
  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'revision_id',
    primary: true,
    deleteRule: 'cascade',
  })
  revision: GameRevisionEntity;

  @ManyToOne(() => GameTagEntity, {
    fieldName: 'tag_id',
    primary: true,
    deleteRule: 'restrict',
  })
  tag: GameTagEntity;
}

@Entity({ tableName: 'game_links' })
@Unique({ properties: ['revision', 'position'] })
export class GameLinkEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: GameRevisionEntity;

  @Property({ length: 64 })
  icon: string;

  @Property({ length: 80 })
  label: string;

  @Property({ length: 2048 })
  link: string;

  @Property({ type: 'smallint' })
  position: number;
}

@Entity({ tableName: 'game_attachments' })
@Unique({ properties: ['revision', 'position'] })
export class GameAttachmentEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: GameRevisionEntity;

  @Enum({ items: () => GameAttachmentType })
  type: GameAttachmentType;

  @Property({ length: 2048 })
  url: string;

  @Property({ type: 'smallint' })
  position: number;
}

@Entity({ tableName: 'game_likes' })
@Index({ properties: ['user_id', 'created_at'] })
export class GameLikeEntity {
  @ManyToOne(() => GameEntity, {
    fieldName: 'game_id',
    primary: true,
    deleteRule: 'cascade',
  })
  game: GameEntity;

  @PrimaryKey({ type: 'bigint' })
  user_id: bigint;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  created_at = new Date();
}

@Entity({ tableName: 'game_review_events' })
export class GameReviewEventEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @ManyToOne(() => GameEntity, {
    fieldName: 'game_id',
    deleteRule: 'cascade',
  })
  game: GameEntity;

  @ManyToOne(() => GameRevisionEntity, {
    fieldName: 'revision_id',
    deleteRule: 'cascade',
  })
  revision: GameRevisionEntity;

  @Enum({ items: () => GameReviewAction })
  action: GameReviewAction;

  @Property({ type: 'bigint' })
  actor_id: bigint;

  @Property({ type: 'text', nullable: true })
  comment: string | null = null;

  @Property({ type: 'timestamptz', defaultRaw: 'now()' })
  created_at = new Date();
}
