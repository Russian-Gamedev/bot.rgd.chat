import { Migration } from '@mikro-orm/migrations';

export class Migration20251113235149 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "video_embeds" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "file_id" text not null, "metadata" jsonb not null, constraint "video_embeds_pkey" primary key ("id"));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "video_embeds" cascade;`);
  }
}
