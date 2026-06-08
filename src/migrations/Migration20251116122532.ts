import { Migration } from '@mikro-orm/migrations';

export class Migration20251116122532 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "guild_invites" ("id" varchar(255) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "name" varchar(255) null, "uses" int not null, "inviter_id" bigint not null, constraint "guild_invites_pkey" primary key ("id"));`,
    );

    this.addSql(
      `create table "guild_invites_history" ("id" serial primary key, "guild_id" bigint not null, "user_id" bigint not null, "invite_code" varchar(255) not null, "invite_user" bigint not null, "joined_at" timestamptz not null default now(), "left_at" timestamptz null);`,
    );

    this.addSql(`alter table "users" drop column "invited_by";`);

    this.addSql(
      `alter table "users" alter column "username" type text using ("username"::text);`,
    );
    this.addSql(`alter table "users" alter column "username" set default '';`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "guild_invites" cascade;`);

    this.addSql(`drop table if exists "guild_invites_history" cascade;`);

    this.addSql(
      `alter table "users" add column "invited_by" varchar(255) null;`,
    );
    this.addSql(`alter table "users" alter column "username" drop default;`);
    this.addSql(
      `alter table "users" alter column "username" type text using ("username"::text);`,
    );
  }
}
