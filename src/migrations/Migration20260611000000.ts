import { Migration } from '@mikro-orm/migrations';

export class Migration20260611000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`drop table if exists "crosspost_deliveries" cascade;`);
    this.addSql(`drop table if exists "crosspost_routes" cascade;`);
  }
}
