import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator } from '@mikro-orm/migrations';

import { migrations } from '#root/migrations';

export const commonOrmConfig = {
  metadataProvider: ReflectMetadataProvider,

  extensions: [Migrator],

  migrations: {
    tableName: 'mikro_orm_migrations',
    transactional: true,
    disableForeignKeys: true,
    allOrNothing: true,
    emit: 'ts' as const,
    snapshotName: 'snapshot',
    migrationsList: migrations,
  },

  debug: process.env.DATABASE_QUERY_LOG === 'true',

  allowGlobalContext: true,
};
