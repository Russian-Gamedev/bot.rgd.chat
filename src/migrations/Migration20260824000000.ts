import { Migration } from '@mikro-orm/migrations';

export class Migration20260824000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "guild_events" add column "author_id" bigint null;`,
    );
    this.addSql(
      `delete from "guild_events" as ge using "guild_events" as kept where ge."event" = kept."event" and ge."message" = kept."message" and ge."id" > kept."id";`,
    );
    this.addSql(`alter table "guild_events" drop column "guild_id";`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "guild_events" add column "guild_id" bigint not null default 0;`,
    );
    this.addSql(
      `create index if not exists "guild_events_guild_id_index" on "guild_events" ("guild_id");`,
    );
    this.addSql(`alter table "guild_events" drop column "author_id";`);
  }
}
