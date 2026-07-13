import { Migration } from '@mikro-orm/migrations';

export class Migration20260713002000 extends Migration {
  override up(): void | Promise<void> {
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
