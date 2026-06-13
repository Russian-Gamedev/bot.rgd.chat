import { Migration } from '@mikro-orm/migrations';

export class Migration20260612004000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_unique";`,
    );
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_guild_id_unique";`,
    );
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_foreign";`,
    );
    this.addSql(`drop index if exists "auth_user_id_unique";`);
    this.addSql(`drop index if exists "auth_user_id_guild_id_unique";`);

    this.addSql(`
      delete from "auth" a
      using "auth" b
      where a."id" > b."id"
        and a."user_id" = b."user_id";
    `);

    this.addSql(`alter table "auth" drop column if exists "guild_id";`);
    this.addSql(
      `create unique index if not exists "auth_user_id_unique" on "auth" ("user_id");`,
    );

    this.addSql(`
      create table if not exists "permission_grants" (
        "id" serial primary key,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "actor_type" text not null,
        "actor_id" bigint not null,
        "guild_id" bigint null,
        "permission" text not null
      );
    `);
    this.addSql(
      `create index if not exists "permission_grants_actor_type_actor_id_index" on "permission_grants" ("actor_type", "actor_id");`,
    );
    this.addSql(
      `create index if not exists "permission_grants_guild_id_index" on "permission_grants" ("guild_id");`,
    );
    this.addSql(
      `create unique index if not exists "permission_grants_global_unique" on "permission_grants" ("actor_type", "actor_id", "permission") where "guild_id" is null;`,
    );
    this.addSql(
      `create unique index if not exists "permission_grants_guild_unique" on "permission_grants" ("actor_type", "actor_id", "permission", "guild_id") where "guild_id" is not null;`,
    );
    this.addSql(`
      alter table "permission_grants"
      drop constraint if exists "permission_grants_actor_type_check";
    `);
    this.addSql(`
      alter table "permission_grants"
      add constraint "permission_grants_actor_type_check"
      check ("actor_type" in ('user', 'bot'));
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "permission_grants" cascade;`);

    this.addSql(`drop index if exists "auth_user_id_unique";`);
    this.addSql(
      `alter table "auth" add column if not exists "guild_id" bigint not null default 0;`,
    );
    this.addSql(
      `create unique index if not exists "auth_user_id_guild_id_unique" on "auth" ("user_id", "guild_id");`,
    );
  }
}
