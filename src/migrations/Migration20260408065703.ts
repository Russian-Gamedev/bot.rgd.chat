import { Migration } from '@mikro-orm/migrations';

export class Migration20260408065703 extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "wallet_transactions" ("id" uuid not null default uuidv7(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "user_id" bigint not null, "guild_id" bigint not null, "amount" bigint not null, "balance_after" bigint not null, "type" text not null, "reason" text null, "related_user_id" bigint null, "metadata" jsonb null, primary key ("id"));`);
    this.addSql(`create index "wallet_transactions_type_index" on "wallet_transactions" ("type");`);
    this.addSql(`create index "wallet_transactions_user_id_guild_id_index" on "wallet_transactions" ("user_id", "guild_id");`);

    this.addSql(`alter table "wallet_transactions" add constraint "wallet_transactions_type_check" check ("type" in ('credit', 'debit', 'transfer_in', 'transfer_out'));`);

    this.addSql(`alter table "users" alter column "coins" type bigint using ("coins"::bigint);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "wallet_transactions" cascade;`);

    this.addSql(`alter table "users" alter column "coins" type int using ("coins"::int);`);
  }

}
