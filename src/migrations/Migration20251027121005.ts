import { Migration } from '@mikro-orm/migrations';

export class Migration20251027121005 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin
  alter table "users" alter column "coins" type int using ("coins"::int);
exception when undefined_column then null;
end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "users" alter column "coins" type bigint using ("coins"::bigint);`,
    );
  }
}
