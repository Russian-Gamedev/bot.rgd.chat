import { Migration } from '@mikro-orm/migrations';

export class Migration20260923122255 extends Migration {
  override name = 'Migration20260923122255';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "golder_media" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "slug" varchar(255) not null, "tags" jsonb not null, "uploaded_by" bigint not null, "object_key" varchar(255) not null, "status" text not null default 'pending', "content_type" varchar(255) not null, "size_bytes" bigint not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "golder_media" add constraint "golder_media_slug_unique" unique ("slug");`,
    );
    this.addSql(
      `alter table "golder_media" add constraint "golder_media_object_key_unique" unique ("object_key");`,
    );
    this.addSql(
      `alter table "golder_media" add constraint "golder_media_status_check" check ("status" in ('pending', 'ready'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "golder_media" cascade;`);
  }
}
