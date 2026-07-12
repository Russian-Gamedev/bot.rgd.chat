import { defineConfig } from '@mikro-orm/postgresql';

import { commonOrmConfig } from './common/mikro-orm.common';

const isMikroOrmCli = process.argv.some((arg) => arg.includes('mikro-orm'));

const entities = isMikroOrmCli ? ['./**/entities/*.entity.ts'] : [];

export default defineConfig({
  ...commonOrmConfig,

  clientUrl: process.env.POSTGRES_URL,

  entities,
  entitiesTs: entities,
});
