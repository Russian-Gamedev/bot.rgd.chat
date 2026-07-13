import { Migration } from '@mikro-orm/migrations';

export class Migration20260713001000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "users" add column if not exists "ban_count" int not null default 0;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "users" drop column if exists "ban_count";`);
  }
}
