import { Migration } from '@mikro-orm/migrations';

export class Migration20260612001000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "users" add column if not exists "nickname" text null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "users" drop column if exists "nickname";`);
  }
}
