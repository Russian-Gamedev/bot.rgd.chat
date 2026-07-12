import { defineConfig } from '@mikro-orm/postgresql';

import { commonOrmConfig } from './mikro-orm.common';

export const postgresOrmConfig = defineConfig({
  ...commonOrmConfig,

  clientUrl: process.env.POSTGRES_URL,
});
