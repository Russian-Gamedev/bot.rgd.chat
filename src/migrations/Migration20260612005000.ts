import { Migration } from '@mikro-orm/migrations';

export class Migration20260612005000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_foreign";`,
    );
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_unique";`,
    );
    this.addSql(`drop index if exists "auth_user_id_unique";`);
    this.addSql(
      `alter table "auth" alter column "user_id" type bigint using ("user_id"::bigint);`,
    );

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'users'
            and column_name = 'id'
        ) then
          update "auth" as auth
          set "user_id" = users."user_id"
          from "users"
          where auth."user_id" = users."id"
            and not exists (
              select 1
              from "users" existing
              where existing."user_id" = auth."user_id"
            );
        end if;
      end $$;
    `);

    this.addSql(`
      delete from "auth" a
      using "auth" b
      where a.ctid > b.ctid
        and a."user_id" = b."user_id";
    `);

    this.addSql(`alter table "auth" alter column "user_id" set not null;`);
    this.addSql(`alter table "auth" drop constraint if exists "auth_pkey";`);
    this.addSql(`alter table "auth" drop column if exists "id";`);
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'auth'::regclass
            and conname = 'auth_pkey'
        ) then
          alter table "auth" add constraint "auth_pkey" primary key ("user_id");
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "auth" drop constraint if exists "auth_pkey";`);
    this.addSql(`alter table "auth" add column if not exists "id" bigserial;`);
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'auth'::regclass
            and conname = 'auth_pkey'
        ) then
          alter table "auth" add constraint "auth_pkey" primary key ("id");
        end if;
      end $$;
    `);
    this.addSql(`drop index if exists "auth_user_id_unique";`);

    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'users'
            and column_name = 'id'
        ) then
          update "auth" as auth
          set "user_id" = users."id"
          from "users"
          where auth."user_id" = users."user_id";
        end if;
      end $$;
    `);

    this.addSql(
      `create unique index if not exists "auth_user_id_unique" on "auth" ("user_id");`,
    );
  }
}
