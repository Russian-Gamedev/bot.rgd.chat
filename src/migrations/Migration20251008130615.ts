import { Migration } from '@mikro-orm/migrations';

export class Migration20251008130615 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "guilds" ("id" bigserial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "name" varchar(255) not null, "owner_id" bigint not null, "icon_url" varchar(255) null);`,
    );

    this.addSql(
      `create table if not exists "guild_settings" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "key" varchar(255) not null, "value" jsonb not null);`,
    );

    this.addSql(
      `create table if not exists "roles" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "role_id" bigint not null, "name" varchar(255) not null, "color" varchar(255) not null, "position" int not null);`,
    );

    this.addSql(
      `create table if not exists "users" ("id" bigserial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now());`,
    );

    this.addSql(
      `create table if not exists "activities" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "user_id" bigint not null, "period" varchar(255) not null, "message" int not null default 0, "voice" int not null default 0, "reactions" int not null default 0, constraint "activities_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "activities_guild_id_index" on "activities" ("guild_id");`,
    );
    this.addSql(
      `create index if not exists "activities_user_id_index" on "activities" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "activities_period_index" on "activities" ("period");`,
    );
  }
}
