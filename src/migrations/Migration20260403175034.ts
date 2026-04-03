import { Migration } from '@mikro-orm/migrations';

export class Migration20260403175034 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "guild_motds" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "author_id" bigint null, "content" varchar(255) not null);`);
 }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "guild_motds" cascade;`);
  }

}
