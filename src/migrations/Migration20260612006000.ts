import { Migration } from '@mikro-orm/migrations';

export class Migration20260612006000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "bots" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "name" varchar(255) not null, "owner_id" bigint not null, "scopes" text[] not null default '{}', "token_hash" varchar(255) not null, "last_used_at" time with time zone null);`,
    );
    this.addSql(
      `create unique index if not exists "bots_name_unique" on "bots" ("name");`,
    );
    this.addSql(
      `alter table "bots" add column if not exists "bot_user_id" bigint null;`,
    );
    this.addSql(
      `create index if not exists "bots_bot_user_id_index" on "bots" ("bot_user_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "bots_bot_user_id_index";`);
    this.addSql(`alter table "bots" drop column if exists "bot_user_id";`);
  }
}
