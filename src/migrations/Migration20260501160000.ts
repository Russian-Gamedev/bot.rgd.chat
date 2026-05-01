import { Migration } from '@mikro-orm/migrations';

export class Migration20260501160000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`create table "crosspost_routes" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "name" text not null, "enabled" boolean not null default true, "source_kind" text not null, "source_key" text not null, "source_config" jsonb not null, "targets" jsonb not null, "settings" jsonb not null, primary key ("id"));`);
    this.addSql(`create index "crosspost_routes_source_kind_index" on "crosspost_routes" ("source_kind");`);
    this.addSql(`create index "crosspost_routes_source_key_index" on "crosspost_routes" ("source_key");`);
    this.addSql(`create index "crosspost_routes_enabled_source_kind_source_key_index" on "crosspost_routes" ("enabled", "source_kind", "source_key");`);
    this.addSql(`alter table "crosspost_routes" add constraint "crosspost_routes_source_kind_check" check ("source_kind" in ('discord_channel', 'telegram_channel'));`);

    this.addSql(`create table "crosspost_deliveries" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "route_id" uuid not null, "target_id" text not null, "source_key" text not null, "source_message_id" text not null, "target_message_id" text not null, "deleted_at" timestamptz null default null, primary key ("id"));`);
    this.addSql(`create index "crosspost_deliveries_route_id_index" on "crosspost_deliveries" ("route_id");`);
    this.addSql(`create index "crosspost_deliveries_source_key_index" on "crosspost_deliveries" ("source_key");`);
    this.addSql(`alter table "crosspost_deliveries" add constraint "crosspost_deliveries_route_target_source_message_unique" unique ("route_id", "target_id", "source_message_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "crosspost_deliveries" cascade;`);
    this.addSql(`drop table if exists "crosspost_routes" cascade;`);
  }
}

