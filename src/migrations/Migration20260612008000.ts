import { Migration } from '@mikro-orm/migrations';

export class Migration20260612008000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "guild_users" add column if not exists "nickname" text null;`,
    );
    this.addSql(
      `alter table "guild_users" add column if not exists "avatar_url" text null;`,
    );
    this.addSql(
      `alter table "guild_users" add column if not exists "banner" text null;`,
    );
    this.addSql(
      `alter table "guild_users" add column if not exists "display_color" text null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "guild_users" drop column if exists "nickname";`);
    this.addSql(
      `alter table "guild_users" drop column if exists "avatar_url";`,
    );
    this.addSql(`alter table "guild_users" drop column if exists "banner";`);
    this.addSql(
      `alter table "guild_users" drop column if exists "display_color";`,
    );
  }
}
