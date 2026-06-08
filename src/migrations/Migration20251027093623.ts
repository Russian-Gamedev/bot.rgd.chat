import { Migration } from '@mikro-orm/migrations';

export class Migration20251027093623 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "items" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "user_id" bigint not null, "name" varchar(255) not null, "description" varchar(255) not null, "color" varchar(7) not null, "image" varchar(255) null, "rare" varchar(255) not null, "transferable" boolean not null);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "items" cascade;`);
  }
}
