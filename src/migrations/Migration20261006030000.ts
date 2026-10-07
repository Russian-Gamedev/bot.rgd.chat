import { Migration } from '@mikro-orm/migrations';
export class Migration20261006030000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `alter table "project_revisions" alter column "release_date" drop not null;`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      `alter table "project_revisions" alter column "release_date" set not null;`,
    );
  }
}
