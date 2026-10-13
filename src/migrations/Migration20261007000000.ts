import { Migration } from '@mikro-orm/migrations';
export class Migration20261007000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create extension if not exists "pg_trgm";`);
    this.addSql(
      `do $$ begin execute format('alter database %I set pg_trgm.word_similarity_threshold = %s', current_database(), 0.3); end $$;`,
    );
    this.addSql(
      `create index "users_username_trgm_index" on "users" using gin (lower("username") gin_trgm_ops);`,
    );
    this.addSql(
      `create index "users_nickname_trgm_index" on "users" using gin (lower("nickname") gin_trgm_ops);`,
    );
    this.addSql(
      `create index "users_user_id_text_index" on "users" (("user_id"::text) text_pattern_ops);`,
    );
  }
  async down(): Promise<void> {
    this.addSql(
      `do $$ begin execute format('alter database %I reset pg_trgm.word_similarity_threshold', current_database()); end $$;`,
    );
    this.addSql(`drop index if exists "users_user_id_text_index";`);
    this.addSql(`drop index if exists "users_nickname_trgm_index";`);
    this.addSql(`drop index if exists "users_username_trgm_index";`);
    this.addSql(`drop extension if exists "pg_trgm";`);
  }
}
