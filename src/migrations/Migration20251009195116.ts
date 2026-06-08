import { Migration } from '@mikro-orm/migrations';

export class Migration20251009195116 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "guild_events" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "event" varchar(255) not null, "message" text not null, "attachments" text[] null, "triggered_count" int not null default 0, constraint "guild_events_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "guild_events_guild_id_index" on "guild_events" ("guild_id");`,
    );
    this.addSql(
      `create index if not exists "guild_events_event_index" on "guild_events" ("event");`,
    );

    this.addSql(
      `create table if not exists "user_roles" ("id" uuid not null default uuidv7(), "guild_id" bigint not null, "user_id" bigint not null, "role_id" bigint not null, constraint "user_roles_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "user_roles_guild_id_index" on "user_roles" ("guild_id");`,
    );
    this.addSql(
      `create index if not exists "user_roles_user_id_index" on "user_roles" ("user_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "guild_events" cascade;`);

    this.addSql(`drop table if exists "user_roles" cascade;`);
  }
}
