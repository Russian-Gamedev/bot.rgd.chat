import { Migration } from '@mikro-orm/migrations';

export class Migration20260705000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table if not exists "user_profile_tags" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "name" text not null, "color" text not null, "background" text not null, "description" text not null, constraint "user_profile_tags_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create index if not exists "user_profile_tags_user_id_index" on "user_profile_tags" ("user_id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "user_profile_tags" cascade;`);
  }
}
