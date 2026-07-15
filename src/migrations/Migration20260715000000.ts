import { Migration } from '@mikro-orm/migrations';

export class Migration20260715000000 extends Migration {
  override up(): void {
    this.addSql(
      `alter table "game_revisions" add column "hide_owner" boolean not null default false;`,
    );
    this.addSql(
      `alter table "game_authors" add column "role" varchar(80) not null default 'Автор';`,
    );
    this.addSql(`alter table "game_authors" alter column "role" drop default;`);
  }

  override down(): void {
    this.addSql(`alter table "game_authors" drop column "role";`);
    this.addSql(`alter table "game_revisions" drop column "hide_owner";`);
  }
}
