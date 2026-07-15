import { Migration } from '@mikro-orm/migrations';

export class Migration20260715001000 extends Migration {
  override up(): void {
    this.addSql(
      `alter table "game_revisions" add column "promo" varchar(100) null;`,
    );
  }

  override down(): void {
    this.addSql(`alter table "game_revisions" drop column "promo";`);
  }
}
