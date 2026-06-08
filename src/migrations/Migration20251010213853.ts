import { Migration } from '@mikro-orm/migrations';

export class Migration20251010213853 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin
  alter table "users" add column "user_id" bigint not null;
exception when duplicate_column then null;
end $$;`);
    this.addSql(`do $$ begin
  alter table "users" alter column "id" type int using ("id"::int);
exception when undefined_column then null;
end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" drop column "user_id";`);

    this.addSql(
      `alter table "users" alter column "id" type bigint using ("id"::bigint);`,
    );
  }
}
