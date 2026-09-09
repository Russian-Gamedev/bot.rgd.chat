import { Migration } from '@mikro-orm/migrations';

export class Migration20260909000000 extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `create table "mini_game_rounds" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "user_id" bigint not null, "game" text not null, "bet" bigint not null, "payout" bigint not null, "details" jsonb null, primary key ("id"));`,
    );
    this.addSql(
      `create index "mini_game_rounds_guild_id_user_id_index" on "mini_game_rounds" ("guild_id", "user_id");`,
    );
    this.addSql(
      `create index "mini_game_rounds_game_index" on "mini_game_rounds" ("game");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "mini_game_rounds";`);
  }
}
