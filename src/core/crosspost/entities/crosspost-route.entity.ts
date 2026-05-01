import {
  Entity,
  Index,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';

import { BaseEntity } from '#common/entities/base.entity';

import type {
  CrossPostSettings,
  CrossPostSourceConfig,
  CrossPostTarget,
} from '../types/crosspost.types';
import { CrossPostSourceKind } from '../types/crosspost.types';

@Entity({ tableName: 'crosspost_routes' })
@Index({
  name: 'crosspost_routes_enabled_source_kind_source_key_index',
  properties: ['enabled', 'sourceKind', 'sourceKey'],
})
export class CrossPostRouteEntity extends BaseEntity {
  @PrimaryKey({ type: 'uuid', defaultRaw: 'uuidv7()' })
  id: string;

  @Property({ type: 'text' })
  name: string;

  @Property({ default: true })
  enabled = true;

  @Property({ type: 'text', fieldName: 'source_kind', index: true })
  sourceKind: CrossPostSourceKind;

  @Property({ type: 'text', fieldName: 'source_key', index: true })
  sourceKey: string;

  @Property({ type: 'jsonb', fieldName: 'source_config' })
  sourceConfig: CrossPostSourceConfig;

  @Property({ type: 'jsonb' })
  targets: CrossPostTarget[];

  @Property({ type: 'jsonb' })
  settings: CrossPostSettings;
}
