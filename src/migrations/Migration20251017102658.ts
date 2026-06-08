import { Migration } from '@mikro-orm/migrations';

export class Migration20251017102658 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop index "users_guild_id_index";`);

    this.addSql(
      `alter table "users" add column "invited_by" varchar(255) null;`,
    );
    this.addSql(
      `alter table "users" alter column "voice_time" type bigint using ("voice_time"::bigint);`,
    );
    this.addSql(
      `create index "users_user_id_guild_id_index" on "users" ("user_id", "guild_id");`,
    );
    this.addSql(
      `alter table "users" add constraint "users_user_id_guild_id_unique" unique ("user_id", "guild_id");`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index "users_user_id_guild_id_index";`);
    this.addSql(
      `alter table "users" drop constraint "users_user_id_guild_id_unique";`,
    );
    this.addSql(`alter table "users" drop column "invited_by";`);

    this.addSql(
      `alter table "users" alter column "voice_time" type int4 using ("voice_time"::int4);`,
    );
    this.addSql(`create index "users_guild_id_index" on "users" ("guild_id");`);
  }
}
