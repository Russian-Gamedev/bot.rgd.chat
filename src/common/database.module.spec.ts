import { describe, expect, it, mock } from 'bun:test';
import type { MikroORM } from '@mikro-orm/core';
import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '#config/env';
import { DatabaseModule } from './database.module';

function createDatabaseModule(pendingMigrations: string[]) {
  const getPending = mock(async () =>
    pendingMigrations.map((name) => ({ name })),
  );
  const up = mock(async () => undefined);
  const orm = {
    migrator: { getPending, up },
  } as unknown as MikroORM;
  const config = {
    getOrThrow: () => 'test',
  } as unknown as ConfigService<EnvironmentVariables>;

  return {
    module: new DatabaseModule(orm, config),
    getPending,
    up,
  };
}

describe('DatabaseModule', () => {
  it('applies pending migrations during module initialization', async () => {
    const { module, getPending, up } = createDatabaseModule([
      'Migration20260713001000',
    ]);

    await module.onModuleInit();

    expect(getPending).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
  });

  it('does not run migrations when none are pending', async () => {
    const { module, up } = createDatabaseModule([]);

    await module.onModuleInit();

    expect(up).not.toHaveBeenCalled();
  });
});
