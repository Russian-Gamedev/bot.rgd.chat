import { Migration } from '@mikro-orm/migrations';

export class Migration20261024190000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `alter table "guild_users" add column if not exists "highest_role_id" bigint null;`,
    );
    this.addSql(
      `alter table "guild_users" add column if not exists "role_synced_at" timestamptz null;`,
    );
  }

  async down(): Promise<void> {
    this.addSql(
      `alter table "guild_users" drop column if exists "role_synced_at";`,
    );
    this.addSql(
      `alter table "guild_users" drop column if exists "highest_role_id";`,
    );
  }
}
