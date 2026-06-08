import { Migration } from '@mikro-orm/migrations';

export class Migration20251123154242 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "role_reactions" ("id" serial primary key, "guild_id" bigint not null, "role_id" bigint not null, "message_id" bigint not null, "emoji" text not null);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "role_reactions" cascade;`);
  }
}
