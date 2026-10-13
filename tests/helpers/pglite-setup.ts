import type { MikroORM } from '@mikro-orm/core';

export async function ensureUuidv7Function(orm: MikroORM): Promise<void> {
  await orm.em
    .getConnection()
    .execute(
      `CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;`,
    );
}
