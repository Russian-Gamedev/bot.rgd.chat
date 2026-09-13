import { Migration } from '@mikro-orm/migrations';

export class Migration20260913000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "users" add column "activity_public" boolean not null default false;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "users" drop column "activity_public";`);
  }
}
