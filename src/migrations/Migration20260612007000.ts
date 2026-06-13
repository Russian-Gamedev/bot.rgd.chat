import { Migration } from '@mikro-orm/migrations';

export class Migration20260612007000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      delete from "users" u
      using (
        select
          ctid,
          row_number() over (
            partition by "user_id"
            order by "updated_at" desc nulls last, "created_at" desc nulls last
          ) as rn
        from "users"
      ) duplicates
      where u.ctid = duplicates.ctid
        and duplicates.rn > 1;
    `);

    this.addSql(`drop index if exists "users_user_id_unique";`);
    this.addSql(`drop index if exists "users_user_id_index";`);
    this.addSql(
      `alter table "auth" drop constraint if exists "auth_user_id_foreign";`,
    );
    this.addSql(`alter table "users" drop constraint if exists "users_pkey";`);
    this.addSql(`alter table "users" alter column "user_id" set not null;`);
    this.addSql(`alter table "users" drop column if exists "id";`);
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'users'::regclass
            and conname = 'users_pkey'
        ) then
          alter table "users" add constraint "users_pkey" primary key ("user_id");
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "users" drop constraint if exists "users_pkey";`);
    this.addSql(`alter table "users" add column if not exists "id" bigserial;`);
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conrelid = 'users'::regclass
            and conname = 'users_pkey'
        ) then
          alter table "users" add constraint "users_pkey" primary key ("id");
        end if;
      end $$;
    `);
    this.addSql(
      `create unique index if not exists "users_user_id_unique" on "users" ("user_id");`,
    );
    this.addSql(
      `create index if not exists "users_user_id_index" on "users" ("user_id");`,
    );
  }
}
