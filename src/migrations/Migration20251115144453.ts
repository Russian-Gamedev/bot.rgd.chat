import { Migration } from '@mikro-orm/migrations';

export class Migration20251115144453 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`do $$ begin
  alter table "guilds" add column "custom_banner_url" varchar(255) null;
exception when duplicate_column then null;
end $$;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "guilds" drop column "custom_banner_url";`);
  }
}
