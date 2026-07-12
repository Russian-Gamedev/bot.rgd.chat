import { Migration } from '@mikro-orm/migrations';

export class Migration20260712000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "game_revision_genres" drop constraint "game_revision_genres_genre_foreign";',
    );
    this.addSql('alter table "game_genres" rename to "game_tags";');
    this.addSql(
      'alter table "game_tags" rename constraint "game_genres_pkey" to "game_tags_pkey";',
    );
    this.addSql(
      'alter table "game_tags" rename constraint "game_genres_slug_unique" to "game_tags_slug_unique";',
    );
    this.addSql(
      'alter table "game_tags" rename constraint "game_genres_name_unique" to "game_tags_name_unique";',
    );
    this.addSql(
      'alter table "game_revision_genres" rename to "game_revision_tags";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename column "genre_id" to "tag_id";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename constraint "game_revision_genres_pkey" to "game_revision_tags_pkey";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename constraint "game_revision_genres_revision_foreign" to "game_revision_tags_revision_foreign";',
    );
    this.addSql(
      'alter table "game_revision_tags" add constraint "game_revision_tags_tag_foreign" foreign key ("tag_id") references "game_tags" ("id") on delete restrict;',
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "game_revision_tags" drop constraint "game_revision_tags_tag_foreign";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename constraint "game_revision_tags_revision_foreign" to "game_revision_genres_revision_foreign";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename constraint "game_revision_tags_pkey" to "game_revision_genres_pkey";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename column "tag_id" to "genre_id";',
    );
    this.addSql(
      'alter table "game_revision_tags" rename to "game_revision_genres";',
    );
    this.addSql('alter table "game_tags" rename to "game_genres";');
    this.addSql(
      'alter table "game_genres" rename constraint "game_tags_pkey" to "game_genres_pkey";',
    );
    this.addSql(
      'alter table "game_genres" rename constraint "game_tags_slug_unique" to "game_genres_slug_unique";',
    );
    this.addSql(
      'alter table "game_genres" rename constraint "game_tags_name_unique" to "game_genres_name_unique";',
    );
    this.addSql(
      'alter table "game_revision_genres" add constraint "game_revision_genres_genre_foreign" foreign key ("genre_id") references "game_genres" ("id") on delete restrict;',
    );
  }
}
