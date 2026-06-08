import { Migration } from '@mikro-orm/migrations';

export class Migration20251027182858 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin
  alter table "items" drop column "guild_id";
exception when undefined_column then null;
end $$;`);

    this.addSql(`do $$ begin
  alter table "items" add column "transfer_history" jsonb not null default '[]';
exception when duplicate_column then null;
end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "items" drop column "transfer_history";`);

    this.addSql(`alter table "items" add column "guild_id" bigint not null;`);
  }
}
