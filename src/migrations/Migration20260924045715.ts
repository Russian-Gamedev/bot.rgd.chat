import { Migration } from '@mikro-orm/migrations';

export class Migration20260924045715 extends Migration {
  override name = 'Migration20260924045715';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "golder_media" add column "name" varchar(200) not null default '';`,
    );
    this.addSql(`update "golder_media" set "name" = "slug";`);
    this.addSql(`alter table "golder_media" alter column "name" drop default;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "golder_media" drop column "name";`);
  }
}
