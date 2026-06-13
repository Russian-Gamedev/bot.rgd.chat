import { Migration } from '@mikro-orm/migrations';

export class Migration20260612000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table if not exists "patrons" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "value" double precision not null default 0);`,
    );
    this.addSql(
      `create unique index if not exists "patrons_user_id_unique" on "patrons" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "patrons_user_id_index" on "patrons" ("user_id");`,
    );

    this.addSql(
      `create table if not exists "patrons_history" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "value" double precision not null);`,
    );
    this.addSql(
      `create index if not exists "patrons_history_user_id_index" on "patrons_history" ("user_id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "patrons_history" cascade;`);
    this.addSql(`drop table if exists "patrons" cascade;`);
  }
}
