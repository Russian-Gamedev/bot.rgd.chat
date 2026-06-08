import { Migration } from '@mikro-orm/migrations';

export class Migration20251017120057 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "users" add column "last_active_at" timestamptz not null default now(), add column "active_streak" int not null default 0, add column "max_active_streak" int not null default 0;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "users" drop column "last_active_at", drop column "active_streak", drop column "max_active_streak";`,
    );
  }
}
