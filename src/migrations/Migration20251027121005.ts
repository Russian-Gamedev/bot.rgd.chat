import { Migration } from '@mikro-orm/migrations';

export class Migration20251027121005 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "users" alter column "coins" type int using ("coins"::int);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "users" alter column "coins" type bigint using ("coins"::bigint);`,
    );
  }
}
