create sequence guild_motds_id_seq;

create sequence guild_motds_id_seq1
    as integer;

create table if not exists mikro_orm_migrations
(
    id          serial
    primary key,
    name        varchar(255),
    executed_at timestamp with time zone default CURRENT_TIMESTAMP
                              );

create table if not exists guilds
(
    id                bigserial
    primary key,
    created_at        timestamp with time zone default now() not null,
    updated_at        timestamp with time zone default now() not null,
    name              varchar(255)                           not null,
    owner_id          bigint                                 not null,
    icon_url          varchar(255),
    custom_banner_url varchar(255)
    );

create table if not exists guild_settings
(
    id         serial
    primary key,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    guild_id   bigint                                 not null,
    key        varchar(255)                           not null,
    value      jsonb                                  not null
    );

create table if not exists roles
(
    id         serial
    primary key,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    guild_id   bigint                                 not null,
    role_id    bigint                                 not null,
    name       varchar(255)                           not null,
    color      varchar(255)                           not null,
    position   integer                                not null
    );

create table if not exists activities
(
    id         uuid                     default uuidv7() not null
    primary key,
    created_at timestamp with time zone default now()    not null,
    updated_at timestamp with time zone default now()    not null,
    guild_id   bigint                                    not null,
    user_id    bigint                                    not null,
    period     varchar(255)                              not null,
    message    integer                  default 0        not null,
    voice      integer                  default 0        not null,
    reactions  integer                  default 0        not null
    );

create index if not exists activities_guild_id_index
    on activities (guild_id);

create index if not exists activities_user_id_index
    on activities (user_id);

create index if not exists activities_period_index
    on activities (period);

create table if not exists guild_events
(
    id              uuid                     default uuidv7() not null
    primary key,
    created_at      timestamp with time zone default now()    not null,
    updated_at      timestamp with time zone default now()    not null,
    guild_id        bigint                                    not null,
    event           varchar(255)                              not null,
    message         text                                      not null,
    attachments     text[],
    triggered_count integer                  default 0        not null
    );

create index if not exists guild_events_guild_id_index
    on guild_events (guild_id);

create index if not exists guild_events_event_index
    on guild_events (event);

create table if not exists user_roles
(
    id       uuid default uuidv7() not null
    primary key,
    guild_id bigint                not null,
    user_id  bigint                not null,
    role_id  bigint                not null
    );

create index if not exists user_roles_guild_id_index
    on user_roles (guild_id);

create index if not exists user_roles_user_id_index
    on user_roles (user_id);

create table if not exists bots
(
    id           serial
    primary key,
    created_at   timestamp with time zone default now()        not null,
    updated_at   timestamp with time zone default now()        not null,
    name         varchar(255)                                  not null
    constraint bots_name_unique
    unique,
    owner_id     bigint                                        not null,
    scopes       text[]                   default '{}'::text[] not null,
    token_hash   varchar(255)                                  not null,
    last_used_at time(0)
    );

create table if not exists users
(
    id                serial
    primary key,
    created_at        timestamp with time zone default now()        not null,
    updated_at        timestamp with time zone default now()        not null,
    user_id           bigint                                        not null,
    guild_id          bigint                                        not null,
    username          text                     default ''::text     not null,
    avatar            text                                          not null,
    banner            text,
    banner_alt        text,
    banner_color      text                     default '#fff'::text not null,
    first_joined_at   timestamp with time zone default now()        not null,
    about             text,
    is_left_guild     boolean                  default false        not null,
    left_at           timestamp with time zone,
    left_count        integer                  default 0            not null,
    coins             bigint                   default 0            not null,
    birth_date        timestamp with time zone,
    reputation        integer                  default 0            not null,
    experience        integer                  default 0            not null,
    voice_time        bigint                   default 0            not null,
    last_active_at    timestamp with time zone default now()        not null,
    active_streak     integer                  default 0            not null,
    max_active_streak integer                  default 0            not null,
    constraint users_user_id_guild_id_unique
    unique (user_id, guild_id)
    );

create index if not exists users_user_id_guild_id_index
    on users (user_id, guild_id);

create table if not exists auth
(
    id         serial
    primary key,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    user_id    integer                                not null
    constraint auth_user_id_unique
    unique
    constraint auth_user_id_foreign
    references users
                         on delete cascade,
    guild_id   bigint                                 not null
    );

create table if not exists items
(
    id               serial
    primary key,
    created_at       timestamp with time zone default now()       not null,
    updated_at       timestamp with time zone default now()       not null,
    user_id          bigint                                       not null,
    name             varchar(255)                                 not null,
    description      varchar(255)                                 not null,
    color            varchar(7)                                   not null,
    image            varchar(255),
    rare             varchar(255)                                 not null,
    transferable     boolean                                      not null,
    transfer_history jsonb                    default '[]'::jsonb not null
    );

create table if not exists guild_invites
(
    id         varchar(255)                           not null
    primary key,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    guild_id   bigint                                 not null,
    name       varchar(255),
    uses       integer                                not null,
    inviter_id bigint                                 not null
    );

create table if not exists guild_invites_history
(
    id          serial
    primary key,
    guild_id    bigint                                 not null,
    user_id     bigint                                 not null,
    invite_code varchar(255)                           not null,
    invite_user bigint                                 not null,
    joined_at   timestamp with time zone default now() not null,
    left_at     timestamp with time zone
                              );

create table if not exists role_reactions
(
    id         serial
    primary key,
    guild_id   bigint not null,
    role_id    bigint not null,
    message_id bigint not null,
    emoji      text   not null
);

create table if not exists guild_motds
(
    id         integer                  default nextval('guild_motds_id_seq1'::regclass) not null
    primary key,
    created_at timestamp with time zone default now()                                    not null,
    updated_at timestamp with time zone default now()                                    not null,
    author_id  bigint,
    content    varchar(255)                                                              not null
    );

alter sequence guild_motds_id_seq1 owned by guild_motds.id;

create table if not exists wallet_transactions
(
    id              uuid                     default uuidv7() not null
    primary key,
    created_at      timestamp with time zone default now()    not null,
    updated_at      timestamp with time zone default now()    not null,
    user_id         bigint                                    not null,
    guild_id        bigint                                    not null,
    amount          bigint                                    not null,
    balance_after   bigint                                    not null,
    type            text                                      not null
    constraint wallet_transactions_type_check
    check (type = ANY (ARRAY ['credit'::text, 'debit'::text, 'transfer_in'::text, 'transfer_out'::text])),
    reason          text,
    related_user_id bigint,
    metadata        jsonb
    );

create index if not exists wallet_transactions_type_index
    on wallet_transactions (type);

create index if not exists wallet_transactions_user_id_guild_id_index
    on wallet_transactions (user_id, guild_id);

create table if not exists nickname_history
(
    id           serial
    primary key,
    created_at   timestamp with time zone default now() not null,
    updated_at   timestamp with time zone default now() not null,
    user_id      bigint                                 not null,
    guild_id     bigint                                 not null,
    old_nickname text,
    new_nickname text                                   not null,
    changed_by   bigint                                 not null
    );

create index if not exists nickname_history_user_id_guild_id_index
    on nickname_history (user_id, guild_id);

create table if not exists crosspost_deliveries
(
    id                uuid                     default uuidv7() not null
    primary key,
    created_at        timestamp with time zone default now()    not null,
    updated_at        timestamp with time zone default now()    not null,
    route_id          uuid                                      not null,
    target_id         text                                      not null,
    source_key        text                                      not null,
    source_message_id text                                      not null,
    target_message_id text                                      not null,
    deleted_at        timestamp with time zone,
                                    constraint crosspost_deliveries_route_target_source_message_unique
                                    unique (route_id, target_id, source_message_id)
    );

create index if not exists crosspost_deliveries_route_id_index
    on crosspost_deliveries (route_id);

create index if not exists crosspost_deliveries_source_key_index
    on crosspost_deliveries (source_key);

create table if not exists crosspost_routes
(
    id            uuid                     default uuidv7() not null
    primary key,
    created_at    timestamp with time zone default now()    not null,
    updated_at    timestamp with time zone default now()    not null,
    name          text                                      not null,
    enabled       boolean                  default true     not null,
    source_kind   text                                      not null,
    source_key    text                                      not null,
    source_config jsonb                                     not null,
    targets       jsonb                                     not null,
    settings      jsonb                                     not null
    );

create index if not exists crosspost_routes_source_kind_index
    on crosspost_routes (source_kind);

create index if not exists crosspost_routes_source_key_index
    on crosspost_routes (source_key);

create index if not exists crosspost_routes_enabled_source_kind_source_key_index
    on crosspost_routes (enabled, source_kind, source_key);

