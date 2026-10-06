import { Migration } from '@mikro-orm/migrations';
export class Migration20261006000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table "projects" ("id" uuid not null default uuidv7(),"owner_id" bigint not null,"slug" varchar(160) not null,"published_revision_id" uuid null,"working_revision_id" uuid null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "projects_pkey" primary key ("id"));`,
    );
    this.addSql(
      `alter table "projects" add constraint "projects_slug_unique" unique ("slug");`,
    );
    this.addSql(
      `create table "project_revisions" ("id" uuid not null default uuidv7(),"project_id" uuid not null,"version" int not null,"status" text check ("status" in ('draft','review','published')) not null default 'draft',"title" varchar(120) not null,"description" text not null,"release_date" date not null,"type" text check ("type" in ('game','service','tool','other')) not null default 'game',"promo" varchar(100) null,"hide_owner" boolean not null default false,"created_by" bigint not null,"submitted_at" timestamptz null,"published_at" timestamptz null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "project_revisions_pkey" primary key ("id"),constraint "project_revisions_project_id_foreign" foreign key ("project_id") references "projects" ("id") on delete cascade,constraint "project_revisions_project_id_version_unique" unique ("project_id","version"));`,
    );
    this.addSql(
      `create index "project_revisions_status_updated_at_index" on "project_revisions" ("status","updated_at");create index "project_revisions_release_date_index" on "project_revisions" ("release_date");`,
    );
    this.addSql(
      `alter table "projects" add constraint "projects_published_revision_id_foreign" foreign key ("published_revision_id") references "project_revisions" ("id") on delete set null;alter table "projects" add constraint "projects_working_revision_id_foreign" foreign key ("working_revision_id") references "project_revisions" ("id") on delete set null;`,
    );
    this.addSql(
      `create table "project_authors" ("id" uuid not null default uuidv7(),"revision_id" uuid not null,"type" text check ("type" in ('discord','text')) not null,"discord_user_id" bigint null,"name" varchar(120) null,"role" varchar(80) not null,"position" smallint not null,constraint "project_authors_pkey" primary key ("id"),constraint "project_authors_revision_id_foreign" foreign key ("revision_id") references "project_revisions" ("id") on delete cascade,constraint "project_authors_revision_position_unique" unique ("revision_id","position"),constraint "project_authors_value_check" check (("type"='discord' and "discord_user_id" is not null and "name" is null) or ("type"='text' and "discord_user_id" is null and "name" is not null)));`,
    );
    this.addSql(
      `create table "project_tags" ("id" uuid not null default uuidv7(),"slug" varchar(64) not null,"name" varchar(80) not null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "project_tags_pkey" primary key ("id"),constraint "project_tags_slug_unique" unique ("slug"),constraint "project_tags_name_unique" unique ("name"));`,
    );
    this.addSql(
      `create table "project_revision_tags" ("revision_id" uuid not null,"tag_id" uuid not null,constraint "project_revision_tags_pkey" primary key ("revision_id","tag_id"),constraint "project_revision_tags_revision_foreign" foreign key ("revision_id") references "project_revisions" ("id") on delete cascade,constraint "project_revision_tags_tag_foreign" foreign key ("tag_id") references "project_tags" ("id") on delete restrict);`,
    );
    this.addSql(
      `create table "project_links" ("id" uuid not null default uuidv7(),"revision_id" uuid not null,"icon" varchar(64) not null,"label" varchar(80) not null,"link" varchar(2048) not null,"position" smallint not null,constraint "project_links_pkey" primary key ("id"),constraint "project_links_revision_foreign" foreign key ("revision_id") references "project_revisions" ("id") on delete cascade,constraint "project_links_revision_position_unique" unique ("revision_id","position"));`,
    );
    this.addSql(
      `create table "project_attachments" ("id" uuid not null default uuidv7(),"revision_id" uuid not null,"type" text check ("type" in ('image','external_video')) not null,"url" varchar(2048) not null,"position" smallint not null,constraint "project_attachments_pkey" primary key ("id"),constraint "project_attachments_revision_foreign" foreign key ("revision_id") references "project_revisions" ("id") on delete cascade,constraint "project_attachments_revision_position_unique" unique ("revision_id","position"));`,
    );
    this.addSql(
      `create table "project_likes" ("project_id" uuid not null,"user_id" bigint not null,"created_at" timestamptz not null default now(),constraint "project_likes_pkey" primary key ("project_id","user_id"),constraint "project_likes_project_foreign" foreign key ("project_id") references "projects" ("id") on delete cascade);create index "project_likes_user_created_index" on "project_likes" ("user_id","created_at");`,
    );
    this.addSql(
      `create table "project_review_events" ("id" uuid not null default uuidv7(),"project_id" uuid not null,"revision_id" uuid not null,"action" text check ("action" in ('submitted','published','changes_requested')) not null,"actor_id" bigint not null,"comment" text null,"created_at" timestamptz not null default now(),constraint "project_review_events_pkey" primary key ("id"),constraint "project_review_events_project_foreign" foreign key ("project_id") references "projects" ("id") on delete cascade,constraint "project_review_events_revision_foreign" foreign key ("revision_id") references "project_revisions" ("id") on delete cascade,constraint "project_review_events_comment_check" check ("action"<>'changes_requested' or length(trim("comment"))>0));`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      'drop table if exists "project_review_events" cascade;drop table if exists "project_likes" cascade;drop table if exists "project_attachments" cascade;drop table if exists "project_links" cascade;drop table if exists "project_revision_tags" cascade;drop table if exists "project_tags" cascade;drop table if exists "project_authors" cascade;alter table "projects" drop constraint if exists "projects_published_revision_id_foreign";alter table "projects" drop constraint if exists "projects_working_revision_id_foreign";drop table if exists "project_revisions" cascade;drop table if exists "projects" cascade;',
    );
  }
}
