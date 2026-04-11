import { Migration } from '@mikro-orm/migrations';

export class Migration20260411121307 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "nickname_history" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "guild_id" bigint not null, "old_nickname" text null, "new_nickname" text not null, "changed_by" bigint not null);`);
    this.addSql(`create index "nickname_history_user_id_guild_id_index" on "nickname_history" ("user_id", "guild_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "nickname_history" cascade;`);
  }

}
