import { Migration } from '@mikro-orm/migrations';

export class Migration20260724000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table if not exists "portals" (
        "id" serial primary key,
        "guild_a_id" bigint not null,
        "guild_b_id" bigint not null,
        "channel_a_id" bigint not null,
        "channel_b_id" bigint not null,
        "webhook_a_id" varchar not null,
        "webhook_a_token" varchar not null,
        "webhook_b_id" varchar not null,
        "webhook_b_token" varchar not null,
        "created_by" bigint not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );`,
    );
    this.addSql(
      `create index if not exists "portals_channel_a_id_index" on "portals" ("channel_a_id");`,
    );
    this.addSql(
      `create index if not exists "portals_channel_b_id_index" on "portals" ("channel_b_id");`,
    );
    this.addSql(
      `create table if not exists "portal_blacklist" (
        "id" serial primary key,
        "user_id" bigint unique not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );`,
    );
    this.addSql(
      `alter table "portals" add column if not exists "guild_a_id" bigint not null default 0;`,
    );
    this.addSql(
      `alter table "portals" add column if not exists "guild_b_id" bigint not null default 0;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "portals" drop column if exists "guild_b_id";`);
    this.addSql(`alter table "portals" drop column if exists "guild_a_id";`);
    this.addSql(`drop table if exists "portal_blacklist";`);
    this.addSql(`drop table if exists "portals";`);
  }
}
