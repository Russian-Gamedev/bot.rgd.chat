import { Migration } from '@mikro-orm/migrations';

export class Migration20260612006000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "bots" add column if not exists "bot_user_id" bigint null;`,
    );
    this.addSql(
      `create index if not exists "bots_bot_user_id_index" on "bots" ("bot_user_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "bots_bot_user_id_index";`);
    this.addSql(`alter table "bots" drop column if exists "bot_user_id";`);
  }
}
