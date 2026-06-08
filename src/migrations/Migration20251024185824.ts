import { Migration } from '@mikro-orm/migrations';

export class Migration20251024185824 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "auth" ("id" serial primary key, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "guild_id" bigint not null, "user_id" int not null);`,
    );
    this.addSql(
      `alter table "auth" add constraint "auth_user_id_unique" unique ("user_id");`,
    );

    this.addSql(
      `alter table "auth" add constraint "auth_user_id_foreign" foreign key ("user_id") references "users" ("id") on update cascade on delete CASCADE;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "auth" cascade;`);
  }
}
