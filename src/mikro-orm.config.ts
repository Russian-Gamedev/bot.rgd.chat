import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { migrations } from './migrations';

const isMikroOrmCli = process.argv.some((arg) => arg.includes('mikro-orm'));

const entities = isMikroOrmCli ? ['./**/entities/*.entity.ts'] : [];

export default defineConfig({
  metadataProvider: ReflectMetadataProvider,
  clientUrl: process.env.POSTGRES_URL,
  entities: entities,
  entitiesTs: entities,
  extensions: [Migrator],
  driver: PostgreSqlDriver,
  debug: process.env.DATABASE_QUERY_LOG == 'true',
  // TODO: set to false once all external handlers have RequestContext
  allowGlobalContext: true,
  migrations: {
    tableName: 'mikro_orm_migrations',
    transactional: true,
    disableForeignKeys: true,
    allOrNothing: true,
    emit: 'ts',
    snapshotName: 'snapshot',
    migrationsList: migrations,
  },
});
