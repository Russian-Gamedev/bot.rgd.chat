import { Migration } from '@mikro-orm/migrations';

export class Migration20260713000000 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "games" add column "slug" varchar(160) null;');
    this.addSql(`
      update "games" as g
      set "slug" = coalesce(
        nullif(
          trim(both '-' from regexp_replace(lower(r."title"), '[^[:alnum:]]+', '-', 'g')),
          ''
        ),
        'game'
      )
      from "game_revisions" as r
      where r."id" = coalesce(g."published_revision_id", g."working_revision_id");
    `);
    this.addSql(`
      update "games"
      set "slug" = 'game'
      where "slug" is null;
    `);
    this.addSql('alter table "games" alter column "slug" set not null;');
    this.addSql(
      'alter table "games" add constraint "games_slug_unique" unique ("slug");',
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "games" drop constraint if exists "games_slug_unique";',
    );
    this.addSql('alter table "games" drop column "slug";');
  }
}
