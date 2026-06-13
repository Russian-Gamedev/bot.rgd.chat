import { Migration } from '@mikro-orm/migrations';

export class Migration20260612003000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_foreign";`,
    );
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_unique";`,
    );
    this.addSql(`drop index if exists "auth_user_id_unique";`);
    this.addSql(
      `alter table "auth" alter column "user_id" type bigint using ("user_id"::bigint);`,
    );

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'users'
            and column_name = 'guild_id'
        ) and not exists (
          select 1
          from information_schema.tables
          where table_schema = current_schema()
            and table_name = 'users_legacy'
        ) then
          alter table "users" rename to "users_legacy";
        end if;
      end $$;
    `);

    this.addSql(`
      create table if not exists "users" (
        "id" bigserial primary key,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "user_id" bigint not null,
        "username" text not null default '',
        "nickname" text null,
        "avatar_url" text not null,
        "banner" text null,
        "banner_alt" text null,
        "banner_color" text not null default '#fff',
        "first_joined_at" timestamptz not null default now(),
        "about" text null,
        "birth_date" timestamptz null,
        "reputation" int not null default 0,
        "experience" int not null default 0,
        "last_active_at" timestamptz not null default now(),
        "active_streak" int not null default 0,
        "max_active_streak" int not null default 0
      );
    `);

    this.addSql(`
      insert into "users" (
        "id",
        "created_at",
        "updated_at",
        "user_id",
        "username",
        "nickname",
        "avatar_url",
        "banner",
        "banner_alt",
        "banner_color",
        "first_joined_at",
        "about",
        "birth_date",
        "reputation",
        "experience",
        "last_active_at",
        "active_streak",
        "max_active_streak"
      )
      with latest as (
        select distinct on ("user_id")
          "user_id",
          "username",
          "nickname",
          "avatar",
          "banner",
          "banner_alt",
          "banner_color",
          "about",
          "birth_date"
        from "users_legacy"
        order by "user_id", "updated_at" desc, "id" desc
      ),
      aggregated as (
        select
          "user_id",
          min("id") as "id",
          min("created_at") as "created_at",
          max("updated_at") as "updated_at",
          min("first_joined_at") as "first_joined_at",
          coalesce(sum("reputation"), 0)::int as "reputation",
          coalesce(sum("experience"), 0)::int as "experience",
          max("last_active_at") as "last_active_at",
          max("active_streak") as "active_streak",
          max("max_active_streak") as "max_active_streak"
        from "users_legacy"
        group by "user_id"
      )
      select
        aggregated."id",
        aggregated."created_at",
        aggregated."updated_at",
        aggregated."user_id",
        coalesce(latest."username", ''),
        latest."nickname",
        coalesce(latest."avatar", ''),
        latest."banner",
        latest."banner_alt",
        coalesce(latest."banner_color", '#fff'),
        aggregated."first_joined_at",
        latest."about",
        latest."birth_date",
        aggregated."reputation",
        aggregated."experience",
        aggregated."last_active_at",
        aggregated."active_streak",
        greatest(aggregated."max_active_streak", aggregated."active_streak")
      from aggregated
      join latest on latest."user_id" = aggregated."user_id"
      where not exists (
        select 1
        from "users" existing
        where existing."user_id" = aggregated."user_id"
      );
    `);

    this.addSql(
      `select setval(pg_get_serial_sequence('users', 'id'), coalesce((select max("id") from "users"), 1));`,
    );
    this.addSql(`
      delete from "users" duplicate
      using "users" canonical
      where duplicate."user_id" = canonical."user_id"
        and duplicate."id" > canonical."id";
    `);
    this.addSql(
      `create unique index if not exists "users_user_id_unique" on "users" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "users_user_id_index" on "users" ("user_id");`,
    );

    this.addSql(`
      create table if not exists "guild_users" (
        "id" bigserial primary key,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "user_id" bigint not null,
        "guild_id" bigint not null,
        "first_joined_at" timestamptz not null default now(),
        "is_left_guild" boolean not null default false,
        "left_at" timestamptz null,
        "left_count" int not null default 0,
        "active_streak" int not null default 0,
        "max_active_streak" int not null default 0
      );
    `);

    this.addSql(`
      insert into "guild_users" (
        "id",
        "created_at",
        "updated_at",
        "user_id",
        "guild_id",
        "first_joined_at",
        "is_left_guild",
        "left_at",
        "left_count",
        "active_streak",
        "max_active_streak"
      )
      select
        "id",
        "created_at",
        "updated_at",
        "user_id",
        "guild_id",
        "first_joined_at",
        "is_left_guild",
        "left_at",
        "left_count",
        "active_streak",
        greatest("max_active_streak", "active_streak")
      from "users_legacy" as legacy
      where not exists (
        select 1
        from "guild_users" existing
        where existing."user_id" = legacy."user_id"
          and existing."guild_id" = legacy."guild_id"
      );
    `);

    this.addSql(
      `select setval(pg_get_serial_sequence('guild_users', 'id'), coalesce((select max("id") from "guild_users"), 1));`,
    );
    this.addSql(
      `create unique index if not exists "guild_users_user_id_guild_id_unique" on "guild_users" ("user_id", "guild_id");`,
    );
    this.addSql(
      `create index if not exists "guild_users_user_id_guild_id_index" on "guild_users" ("user_id", "guild_id");`,
    );

    this.addSql(`
      update "auth" as auth
      set "user_id" = legacy."user_id"
      from "users_legacy" as legacy
      where auth."user_id" = legacy."id";
    `);
    this.addSql(`
      delete from "auth" a
      using "auth" b
      where a."id" > b."id"
        and a."guild_id" = b."guild_id"
        and a."user_id" = b."user_id";
    `);
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_foreign";`,
    );
    this.addSql(
      `create unique index if not exists "auth_user_id_guild_id_unique" on "auth" ("user_id", "guild_id");`,
    );

    this.addSql(`
      create table if not exists "user_activity_daily" (
        "id" uuid not null default uuidv7(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "date" date not null,
        "user_id" bigint not null,
        "guild_id" bigint null,
        "message_score" int not null default 0,
        "voice_seconds" bigint not null default 0,
        "reaction_count" int not null default 0,
        constraint "user_activity_daily_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create index if not exists "user_activity_daily_date_index" on "user_activity_daily" ("date");`,
    );
    this.addSql(
      `create index if not exists "user_activity_daily_user_id_index" on "user_activity_daily" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "user_activity_daily_guild_id_index" on "user_activity_daily" ("guild_id");`,
    );
    this.addSql(
      `create unique index if not exists "user_activity_daily_global_unique" on "user_activity_daily" ("date", "user_id") where "guild_id" is null;`,
    );
    this.addSql(
      `create unique index if not exists "user_activity_daily_guild_unique" on "user_activity_daily" ("date", "user_id", "guild_id") where "guild_id" is not null;`,
    );

    this.addSql(`
      create table if not exists "user_activity_totals" (
        "id" serial primary key,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "user_id" bigint not null,
        "guild_id" bigint null,
        "message_score" int not null default 0,
        "voice_seconds" bigint not null default 0,
        "reaction_count" int not null default 0,
        "last_active_at" timestamptz null
      );
    `);
    this.addSql(
      `create index if not exists "user_activity_totals_user_id_index" on "user_activity_totals" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "user_activity_totals_guild_id_index" on "user_activity_totals" ("guild_id");`,
    );
    this.addSql(
      `create unique index if not exists "user_activity_totals_global_unique" on "user_activity_totals" ("user_id") where "guild_id" is null;`,
    );
    this.addSql(
      `create unique index if not exists "user_activity_totals_guild_unique" on "user_activity_totals" ("user_id", "guild_id") where "guild_id" is not null;`,
    );

    this.addSql(`
      insert into "user_activity_totals" (
        "created_at",
        "updated_at",
        "user_id",
        "guild_id",
        "message_score",
        "voice_seconds",
        "reaction_count",
        "last_active_at"
      )
      with combined as (
        select
          "created_at",
          "updated_at",
          "user_id",
          "guild_id",
          0::int as "message_score",
          coalesce("voice_time", 0)::bigint as "voice_seconds",
          0::int as "reaction_count",
          "last_active_at"
        from "users_legacy"
        union all
        select
          "created_at",
          "updated_at",
          "user_id",
          "guild_id",
          coalesce("message", 0)::int as "message_score",
          0::bigint as "voice_seconds",
          coalesce("reactions", 0)::int as "reaction_count",
          "updated_at" as "last_active_at"
        from "activities"
      )
      select
        min("created_at"),
        max("updated_at"),
        "user_id",
        "guild_id",
        coalesce(sum("message_score"), 0)::int,
        coalesce(sum("voice_seconds"), 0)::bigint,
        coalesce(sum("reaction_count"), 0)::int,
        max("last_active_at")
      from combined
      group by "user_id", "guild_id"
      on conflict do nothing;
    `);

    this.addSql(`
      insert into "user_activity_totals" (
        "created_at",
        "updated_at",
        "user_id",
        "guild_id",
        "message_score",
        "voice_seconds",
        "reaction_count",
        "last_active_at"
      )
      with combined as (
        select
          "created_at",
          "updated_at",
          "user_id",
          0::int as "message_score",
          coalesce("voice_time", 0)::bigint as "voice_seconds",
          0::int as "reaction_count",
          "last_active_at"
        from "users_legacy"
        union all
        select
          "created_at",
          "updated_at",
          "user_id",
          coalesce("message", 0)::int as "message_score",
          0::bigint as "voice_seconds",
          coalesce("reactions", 0)::int as "reaction_count",
          "updated_at" as "last_active_at"
        from "activities"
      )
      select
        min("created_at"),
        max("updated_at"),
        "user_id",
        null,
        coalesce(sum("message_score"), 0)::int,
        coalesce(sum("voice_seconds"), 0)::bigint,
        coalesce(sum("reaction_count"), 0)::int,
        max("last_active_at")
      from combined
      group by "user_id"
      on conflict do nothing;
    `);

    this.addSql(`drop table if exists "activities" cascade;`);
    this.addSql(`drop table if exists "users_legacy" cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_foreign";`,
    );
    this.addSql(`drop index if exists "auth_user_id_guild_id_unique";`);
    this.addSql(`alter table "users" rename to "users_global";`);

    this.addSql(`
      create table "users" (
        "id" bigserial primary key,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "user_id" bigint not null,
        "guild_id" bigint not null,
        "username" text not null default '',
        "nickname" text null,
        "avatar" text not null,
        "banner" text null,
        "banner_alt" text null,
        "banner_color" text not null default '#fff',
        "first_joined_at" timestamptz not null default now(),
        "about" text null,
        "is_left_guild" boolean not null default false,
        "left_at" timestamptz null,
        "left_count" int not null default 0,
        "birth_date" timestamptz null,
        "reputation" int not null default 0,
        "experience" int not null default 0,
        "voice_time" bigint not null default 0,
        "last_active_at" timestamptz not null default now(),
        "active_streak" int not null default 0,
        "max_active_streak" int not null default 0
      );
    `);

    this.addSql(`
      insert into "users" (
        "id",
        "created_at",
        "updated_at",
        "user_id",
        "guild_id",
        "username",
        "nickname",
        "avatar",
        "banner",
        "banner_alt",
        "banner_color",
        "first_joined_at",
        "about",
        "is_left_guild",
        "left_at",
        "left_count",
        "birth_date",
        "reputation",
        "experience",
        "voice_time",
        "last_active_at",
        "active_streak",
        "max_active_streak"
      )
      select
        guild_users."id",
        guild_users."created_at",
        greatest(guild_users."updated_at", users_global."updated_at"),
        guild_users."user_id",
        guild_users."guild_id",
        users_global."username",
        users_global."nickname",
        users_global."avatar_url",
        users_global."banner",
        users_global."banner_alt",
        users_global."banner_color",
        guild_users."first_joined_at",
        users_global."about",
        guild_users."is_left_guild",
        guild_users."left_at",
        guild_users."left_count",
        users_global."birth_date",
        users_global."reputation",
        users_global."experience",
        coalesce(totals."voice_seconds", 0),
        coalesce(totals."last_active_at", users_global."last_active_at"),
        guild_users."active_streak",
        guild_users."max_active_streak"
      from "guild_users" as guild_users
      join "users_global" as users_global on users_global."user_id" = guild_users."user_id"
      left join "user_activity_totals" as totals
        on totals."user_id" = guild_users."user_id"
        and totals."guild_id" = guild_users."guild_id";
    `);

    this.addSql(
      `select setval(pg_get_serial_sequence('users', 'id'), coalesce((select max("id") from "users"), 1));`,
    );
    this.addSql(
      `create unique index if not exists "users_user_id_guild_id_unique" on "users" ("user_id", "guild_id");`,
    );
    this.addSql(
      `create index if not exists "users_user_id_guild_id_index" on "users" ("user_id", "guild_id");`,
    );

    this.addSql(`
      update "auth" as auth
      set "user_id" = users."id"
      from "users_global" as users_global
      join "users" as users on users."user_id" = users_global."user_id"
      where auth."user_id" = users_global."id"
        and auth."guild_id" = users."guild_id";
    `);
    this.addSql(
      `alter table "auth" add constraint "auth_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`,
    );
    this.addSql(
      `create unique index if not exists "auth_user_id_unique" on "auth" ("user_id");`,
    );

    this.addSql(`
      create table "activities" (
        "id" uuid not null default uuidv7(),
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "guild_id" bigint not null,
        "user_id" bigint not null,
        "period" varchar(255) not null,
        "message" int not null default 0,
        "voice" int not null default 0,
        "reactions" int not null default 0,
        constraint "activities_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create index if not exists "activities_guild_id_index" on "activities" ("guild_id");`,
    );
    this.addSql(
      `create index if not exists "activities_user_id_index" on "activities" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "activities_period_index" on "activities" ("period");`,
    );

    this.addSql(`drop table if exists "user_activity_daily" cascade;`);
    this.addSql(`drop table if exists "user_activity_totals" cascade;`);
    this.addSql(`drop table if exists "guild_users" cascade;`);
    this.addSql(`drop table if exists "users_global" cascade;`);
  }
}
