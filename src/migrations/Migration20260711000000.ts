import { Migration } from '@mikro-orm/migrations';
export class Migration20260711000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `create table "games" ("id" uuid not null default uuidv7(),"owner_id" bigint not null,"published_revision_id" uuid null,"working_revision_id" uuid null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "games_pkey" primary key ("id"));`,
    );
    this.addSql(
      `create table "game_revisions" ("id" uuid not null default uuidv7(),"game_id" uuid not null,"version" int not null,"status" text check ("status" in ('draft','review','published')) not null default 'draft',"title" varchar(120) not null,"description" text not null,"release_date" date not null,"created_by" bigint not null,"submitted_at" timestamptz null,"published_at" timestamptz null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "game_revisions_pkey" primary key ("id"),constraint "game_revisions_game_id_foreign" foreign key ("game_id") references "games" ("id") on delete cascade,constraint "game_revisions_game_id_version_unique" unique ("game_id","version"));`,
    );
    this.addSql(
      `create index "game_revisions_status_updated_at_index" on "game_revisions" ("status","updated_at");create index "game_revisions_release_date_index" on "game_revisions" ("release_date");`,
    );
    this.addSql(
      `alter table "games" add constraint "games_published_revision_id_foreign" foreign key ("published_revision_id") references "game_revisions" ("id") on delete set null;alter table "games" add constraint "games_working_revision_id_foreign" foreign key ("working_revision_id") references "game_revisions" ("id") on delete set null;`,
    );
    this.addSql(
      `create table "game_authors" ("id" uuid not null default uuidv7(),"revision_id" uuid not null,"type" text check ("type" in ('discord','text')) not null,"discord_user_id" bigint null,"name" varchar(120) null,"position" smallint not null,constraint "game_authors_pkey" primary key ("id"),constraint "game_authors_revision_id_foreign" foreign key ("revision_id") references "game_revisions" ("id") on delete cascade,constraint "game_authors_revision_position_unique" unique ("revision_id","position"),constraint "game_authors_value_check" check (("type"='discord' and "discord_user_id" is not null and "name" is null) or ("type"='text' and "discord_user_id" is null and "name" is not null)));`,
    );
    this.addSql(
      `create table "game_genres" ("id" uuid not null default uuidv7(),"slug" varchar(64) not null,"name" varchar(80) not null,"created_at" timestamptz not null default now(),"updated_at" timestamptz not null default now(),constraint "game_genres_pkey" primary key ("id"),constraint "game_genres_slug_unique" unique ("slug"),constraint "game_genres_name_unique" unique ("name"));`,
    );
    this.addSql(
      `create table "game_revision_genres" ("revision_id" uuid not null,"genre_id" uuid not null,constraint "game_revision_genres_pkey" primary key ("revision_id","genre_id"),constraint "game_revision_genres_revision_foreign" foreign key ("revision_id") references "game_revisions" ("id") on delete cascade,constraint "game_revision_genres_genre_foreign" foreign key ("genre_id") references "game_genres" ("id") on delete restrict);`,
    );
    this.addSql(
      `create table "game_links" ("id" uuid not null default uuidv7(),"revision_id" uuid not null,"icon" varchar(64) not null,"label" varchar(80) not null,"link" varchar(2048) not null,"position" smallint not null,constraint "game_links_pkey" primary key ("id"),constraint "game_links_revision_foreign" foreign key ("revision_id") references "game_revisions" ("id") on delete cascade,constraint "game_links_revision_position_unique" unique ("revision_id","position"));`,
    );
    this.addSql(
      `create table "game_attachments" ("id" uuid not null default uuidv7(),"revision_id" uuid not null,"type" text check ("type" in ('image','external_video')) not null,"url" varchar(2048) not null,"position" smallint not null,constraint "game_attachments_pkey" primary key ("id"),constraint "game_attachments_revision_foreign" foreign key ("revision_id") references "game_revisions" ("id") on delete cascade,constraint "game_attachments_revision_position_unique" unique ("revision_id","position"));`,
    );
    this.addSql(
      `create table "game_likes" ("game_id" uuid not null,"user_id" bigint not null,"created_at" timestamptz not null default now(),constraint "game_likes_pkey" primary key ("game_id","user_id"),constraint "game_likes_game_foreign" foreign key ("game_id") references "games" ("id") on delete cascade);create index "game_likes_user_created_index" on "game_likes" ("user_id","created_at");`,
    );
    this.addSql(
      `create table "game_review_events" ("id" uuid not null default uuidv7(),"game_id" uuid not null,"revision_id" uuid not null,"action" text check ("action" in ('submitted','published','changes_requested')) not null,"actor_id" bigint not null,"comment" text null,"created_at" timestamptz not null default now(),constraint "game_review_events_pkey" primary key ("id"),constraint "game_review_events_game_foreign" foreign key ("game_id") references "games" ("id") on delete cascade,constraint "game_review_events_revision_foreign" foreign key ("revision_id") references "game_revisions" ("id") on delete cascade,constraint "game_review_events_comment_check" check ("action"<>'changes_requested' or length(trim("comment"))>0));`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      'drop table if exists "game_review_events" cascade;drop table if exists "game_likes" cascade;drop table if exists "game_attachments" cascade;drop table if exists "game_links" cascade;drop table if exists "game_revision_genres" cascade;drop table if exists "game_genres" cascade;drop table if exists "game_authors" cascade;alter table "games" drop constraint if exists "games_published_revision_id_foreign";alter table "games" drop constraint if exists "games_working_revision_id_foreign";drop table if exists "game_revisions" cascade;drop table if exists "games" cascade;',
    );
  }
}
