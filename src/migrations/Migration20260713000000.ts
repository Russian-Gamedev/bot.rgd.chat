import { Migration } from '@mikro-orm/migrations';

export class Migration20260713000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql('alter table "games" add column "slug" varchar(160) null;');
    this.addSql(`
      update "games" as g
      set "slug" = coalesce(
        nullif(
          trim(both '-' from regexp_replace(lower(r."title"), '[^[:alnum:]]+', '-', 'g')),
          ''
        ),
        'game'
      )
      from "game_revisions" as r
      where r."id" = coalesce(g."published_revision_id", g."working_revision_id");
    `);
    this.addSql(`
      update "games"
      set "slug" = 'game'
      where "slug" is null;
    `);
    this.addSql('alter table "games" alter column "slug" set not null;');
    this.addSql(
      'alter table "games" add constraint "games_slug_unique" unique ("slug");',
    );
    this.addSql(
      `drop index if exists "mahoraga_cases_verification_token_unique";`,
    );
    this.addSql(
      `alter table "mahoraga_cases" drop column if exists "verification_token", drop column if exists "verification_expires_at";`,
    );
    this.addSql(
      `alter table "mahoraga_cases" drop constraint if exists "mahoraga_cases_status_check";`,
    );
    this.addSql(
      `alter table "mahoraga_cases" add constraint "mahoraga_cases_status_check" check ("status" in ('observed', 'active', 'pardoned'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      'alter table "games" drop constraint if exists "games_slug_unique";',
    );
    this.addSql('alter table "games" drop column "slug";');
    this.addSql(
      `alter table "mahoraga_cases" drop constraint if exists "mahoraga_cases_status_check";`,
    );
    this.addSql(
      `alter table "mahoraga_cases" add column if not exists "verification_token" text null, add column if not exists "verification_expires_at" timestamptz null;`,
    );
    this.addSql(
      `create unique index if not exists "mahoraga_cases_verification_token_unique" on "mahoraga_cases" ("verification_token");`,
    );
    this.addSql(
      `alter table "mahoraga_cases" add constraint "mahoraga_cases_status_check" check ("status" in ('observed', 'active', 'pardoned'));`,
    );
  }
}
