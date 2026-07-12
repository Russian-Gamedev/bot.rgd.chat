import { defineConfig } from '@mikro-orm/pglite';

import { commonOrmConfig } from './mikro-orm.common';

export const pgliteOrmConfig = defineConfig({
  ...commonOrmConfig,

  debug: false,
});
