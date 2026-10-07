import { Migration } from '@mikro-orm/migrations';
export class Migration20261006010000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table "project_uploads" ("id" uuid not null default uuidv7(),"owner_id" bigint not null,"kind" text check ("kind" in ('banner','attachment')) not null,"object_key" varchar(255) not null,"status" text check ("status" in ('pending','ready')) not null default 'pending',"content_type" varchar(255) not null,"size_bytes" bigint not null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "project_uploads_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "project_uploads" add constraint "project_uploads_object_key_unique" unique ("object_key");`,
    );
    // Изображения-вложения с прямыми ссылками не переносятся в S3: фича ещё
    // не опубликована, строки с URL удаляются перед NOT NULL-инвариантом.
    this.addSql(`delete from "project_attachments" where "type" = 'image';`);
    this.addSql(
      `alter table "project_attachments" add column "upload_id" uuid null;`,
    );
    this.addSql(
      `alter table "project_attachments" alter column "url" drop not null;`,
    );
    this.addSql(
      `alter table "project_attachments" add constraint "project_attachments_upload_foreign" foreign key ("upload_id") references "project_uploads" ("id") on delete set null;`,
    );
    this.addSql(
      `alter table "project_attachments" add constraint "project_attachments_value_check" check (("type"='image' and "upload_id" is not null and "url" is null) or ("type"='external_video' and "upload_id" is null and "url" is not null));`,
    );
    this.addSql(
      `alter table "project_revisions" add column "banner_upload_id" uuid null;`,
    );
    this.addSql(
      `alter table "project_revisions" add constraint "project_revisions_banner_upload_foreign" foreign key ("banner_upload_id") references "project_uploads" ("id") on delete set null;`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      `alter table "project_revisions" drop constraint if exists "project_revisions_banner_upload_foreign";alter table "project_revisions" drop column if exists "banner_upload_id";`,
    );
    this.addSql(
      `alter table "project_attachments" drop constraint if exists "project_attachments_value_check";alter table "project_attachments" drop constraint if exists "project_attachments_upload_foreign";alter table "project_attachments" drop column if exists "upload_id";alter table "project_attachments" alter column "url" set not null;`,
    );
    this.addSql(`drop table if exists "project_uploads" cascade;`);
  }
}
