import { Migration } from '@mikro-orm/migrations';

export class Migration20251008183605 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin
  alter table "users" add column "guild_id" bigint not null, add column "username" text not null, add column "avatar" text not null, add column "banner" text null, add column "banner_alt" text null, add column "banner_color" text not null default '#fff', add column "first_joined_at" timestamptz not null default now(), add column "about" text null, add column "is_left_guild" boolean not null default false, add column "left_at" timestamptz null, add column "left_count" int not null default 0, add column "coins" int not null default 0, add column "birth_date" timestamptz null, add column "reputation" int not null default 0, add column "experience" int not null default 0, add column "voice_time" int not null default 0;
exception when duplicate_column then null;
end $$;`);
    this.addSql(
      `create index if not exists "users_guild_id_index" on "users" ("guild_id");`,
    );
    this.addSql(`do $$ begin
  alter table "users" add constraint "users_username_unique" unique ("username");
exception when duplicate_object then null;
end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "users_guild_id_index";`);
    this.addSql(`alter table "users" drop constraint "users_username_unique";`);
    this.addSql(
      `alter table "users" drop column "guild_id", drop column "username", drop column "avatar", drop column "banner", drop column "banner_alt", drop column "banner_color", drop column "first_joined_at", drop column "about", drop column "is_left_guild", drop column "left_at", drop column "left_count", drop column "coins", drop column "birth_date", drop column "reputation", drop column "experience", drop column "voice_time";`,
    );
  }
}
