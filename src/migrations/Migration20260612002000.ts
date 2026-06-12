import { Migration } from '@mikro-orm/migrations';

export class Migration20260612002000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table if not exists "wallets" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "coins" bigint not null default 0);`,
    );
    this.addSql(
      `create unique index if not exists "wallets_user_id_unique" on "wallets" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "wallets_user_id_index" on "wallets" ("user_id");`,
    );
    this.addSql(
      `insert into "wallets" ("created_at", "updated_at", "user_id", "coins") select min("created_at"), max("updated_at"), "user_id", coalesce(sum("coins"), 0)::bigint from "users" group by "user_id" on conflict ("user_id") do update set "coins" = excluded."coins", "updated_at" = excluded."updated_at";`,
    );
    this.addSql(`alter table "users" drop column if exists "coins";`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "users" add column if not exists "coins" bigint not null default 0;`,
    );
    this.addSql(
      `update "users" set "coins" = "wallets"."coins" from "wallets" where "users"."user_id" = "wallets"."user_id";`,
    );
    this.addSql(`drop table if exists "wallets" cascade;`);
  }
}
