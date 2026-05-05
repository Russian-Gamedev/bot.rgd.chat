import { Migration } from '@mikro-orm/migrations';

export class Migration20260505120000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table "mahoraga_cases" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "status" text not null default 'active', "reason" text not null default 'manual', "source_guild_id" bigint null, "source_channel_id" bigint null, "source_message_id" bigint null, "matched_value" text null, "evidence" jsonb not null default '[]'::jsonb, "detection_count" int not null default 0, "detected_at" timestamptz not null default now(), "last_detected_at" timestamptz not null default now(), "verification_token" text null, "verification_expires_at" timestamptz null, "pardoned_at" timestamptz null, "pardoned_by" bigint null, "pardon_reason" text null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "mahoraga_cases" add constraint "mahoraga_cases_user_id_unique" unique ("user_id");`,
    );
    this.addSql(
      `create unique index "mahoraga_cases_verification_token_unique" on "mahoraga_cases" ("verification_token");`,
    );
    this.addSql(
      `create index "mahoraga_cases_status_index" on "mahoraga_cases" ("status");`,
    );
    this.addSql(
      `create index "mahoraga_cases_source_guild_id_index" on "mahoraga_cases" ("source_guild_id");`,
    );
    this.addSql(
      `create index "mahoraga_cases_reason_index" on "mahoraga_cases" ("reason");`,
    );
    this.addSql(
      `alter table "mahoraga_cases" add constraint "mahoraga_cases_status_check" check ("status" in ('observed', 'pending_verification', 'active', 'pardoned'));`,
    );
    this.addSql(
      `alter table "mahoraga_cases" add constraint "mahoraga_cases_reason_check" check ("reason" in ('honeypot', 'text_repeat', 'link_repeat', 'image_repeat', 'manual'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "mahoraga_cases" cascade;`);
  }
}
