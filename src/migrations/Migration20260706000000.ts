import { Migration } from '@mikro-orm/migrations';

export class Migration20260706000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "users" add column if not exists "profile_info" jsonb not null default '{}'::jsonb;`,
    );
    this.addSql(
      `update "users" set "profile_info" = jsonb_set("profile_info", '{about}', to_jsonb(nullif(trim("about"), '')), true) where "about" is not null and nullif(trim("about"), '') is not null and not ("profile_info" ? 'about');`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "users" drop column if exists "profile_info";`);
  }
}
