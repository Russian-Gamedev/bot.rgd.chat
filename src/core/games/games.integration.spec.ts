import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';
import { Migrator } from '@mikro-orm/migrations';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { NotFoundException } from '@nestjs/common';

import type { PermissionService } from '#core/permissions/permissions.service';
import {
  ActorType,
  type AuthenticatedActor,
} from '#core/permissions/permissions.types';
import { Migration20260711000000 } from '#root/migrations/Migration20260711000000';

import {
  GameAttachmentEntity,
  GameAuthorEntity,
  GameEntity,
  GameGenreEntity,
  GameLikeEntity,
  GameLinkEntity,
  GameReviewEventEntity,
  GameRevisionEntity,
  GameRevisionGenreEntity,
} from './entities/games.entity';
import { GameGenresService } from './game-genres.service';
import { GameLikesService } from './game-likes.service';
import { GameReviewService } from './game-review.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import {
  GameAttachmentType,
  GameAuthorType,
  GameListSort,
  GameRevisionStatus,
} from './games.types';

const configuredUrl =
  process.env.GAMES_INTEGRATION_POSTGRES_URL ?? process.env.POSTGRES_URL;
const run = configuredUrl ? describe : describe.skip;
const entities = [
  GameEntity,
  GameRevisionEntity,
  GameAuthorEntity,
  GameGenreEntity,
  GameRevisionGenreEntity,
  GameLinkEntity,
  GameAttachmentEntity,
  GameLikeEntity,
  GameReviewEventEntity,
];

run('Games full integration flow', () => {
  let adminOrm: MikroORM;
  let orm: MikroORM;
  let controller: GamesController;
  let databaseName: string;

  const owner: AuthenticatedActor = {
    type: ActorType.User,
    id: '100000000000000001',
    username: 'owner',
  };
  const reviewer: AuthenticatedActor = {
    type: ActorType.User,
    id: '100000000000000002',
    username: 'reviewer',
  };
  const fan: AuthenticatedActor = {
    type: ActorType.User,
    id: '100000000000000003',
    username: 'fan',
  };

  beforeAll(async () => {
    const source = new URL(configuredUrl as string);
    databaseName = `games_flow_${process.pid}_${Date.now()}`;
    const adminUrl = new URL(source);
    adminUrl.pathname = '/postgres';

    adminOrm = await MikroORM.init({
      driver: PostgreSqlDriver,
      clientUrl: adminUrl.toString(),
      entities: [GameEntity],
      metadataProvider: ReflectMetadataProvider,
    });
    await adminOrm.em
      .getConnection()
      .execute(`create database "${databaseName}"`);

    const testUrl = new URL(source);
    testUrl.pathname = `/${databaseName}`;
    orm = await MikroORM.init({
      driver: PostgreSqlDriver,
      clientUrl: testUrl.toString(),
      entities,
      metadataProvider: ReflectMetadataProvider,
      allowGlobalContext: true,
      debug: process.env.GAMES_INTEGRATION_DEBUG === 'true',
      extensions: [Migrator],
      migrations: {
        migrationsList: [Migration20260711000000],
        transactional: true,
        snapshot: false,
      },
    });
    await orm.migrator.up();

    const gameRepository = orm.em.getRepository(GameEntity);
    const likeRepository = orm.em.getRepository(GameLikeEntity);
    const games = new GamesService(orm.em, gameRepository, likeRepository);
    const review = new GameReviewService(orm.em, gameRepository, games);
    const likes = new GameLikesService(orm.em, gameRepository, likeRepository);
    const genres = new GameGenresService(
      orm.em,
      orm.em.getRepository(GameGenreEntity),
      orm.em.getRepository(GameRevisionGenreEntity),
    );
    const permissions = {
      hasPermission: async (actor: AuthenticatedActor) =>
        actor.id === reviewer.id,
    } as unknown as PermissionService;
    controller = new GamesController(games, review, likes, genres, permissions);
  });

  afterAll(async () => {
    await orm?.close(true);
    if (adminOrm && databaseName) {
      await adminOrm.em
        .getConnection()
        .execute(
          'select pg_terminate_backend(pid) from pg_stat_activity where datname=? and pid<>pg_backend_pid()',
          [databaseName],
        );
      await adminOrm.em
        .getConnection()
        .execute(`drop database if exists "${databaseName}"`);
    }
    await adminOrm?.close(true);
  });

  it('covers creation variants, review, publication, likes and republishing', async () => {
    const action = await controller.createGenre({
      slug: 'action',
      name: 'Action',
    });
    const puzzle = await controller.createGenre({
      slug: 'puzzle',
      name: 'Puzzle',
    });

    const created = await controller.create(owner, {
      title: 'Version One',
      description: '# Initial markdown',
      release_date: '2026-07-11',
      genre_ids: [action.id, puzzle.id],
      authors: [
        {
          type: GameAuthorType.Discord,
          discord_user_id: owner.id,
        },
        { type: GameAuthorType.Text, name: 'External Team' },
      ],
      links: [
        {
          icon: 'website',
          label: 'Website',
          link: 'https://example.com/game',
        },
      ],
      attachments: [
        {
          type: GameAttachmentType.Image,
          url: 'https://example.com/cover.png',
        },
        {
          type: GameAttachmentType.ExternalVideo,
          url: 'https://example.com/trailer',
        },
      ],
    });

    expect(created.status).toBe(GameRevisionStatus.Draft);
    expect(created.version).toBe(1);
    expect(created.authors).toHaveLength(2);
    expect(created.attachments).toHaveLength(2);
    await expect(controller.get(created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await controller.update(created.id, owner, {
      description: '# Ready for review',
    });
    await controller.submit(created.id, owner);
    expect(
      (await controller.reviewList({ limit: 20, offset: 0 })).items,
    ).toHaveLength(1);

    const returned = await controller.changes(created.id, reviewer, {
      comment: 'Please improve the title.',
    });
    expect(returned.status).toBe(GameRevisionStatus.Draft);
    expect(
      returned.review_events.map(
        (event) => (event as unknown as { action: string }).action,
      ),
    ).toEqual(['submitted', 'changes_requested']);

    await controller.update(created.id, owner, { title: 'Published Version' });
    await controller.submit(created.id, owner);
    await controller.publish(created.id, reviewer, {
      comment: 'Approved.',
    });

    const published = await controller.get(created.id);
    expect(published.title).toBe('Published Version');
    expect(published.authors).toEqual([
      { type: GameAuthorType.Discord, discord_user_id: owner.id },
      { type: GameAuthorType.Text, name: 'External Team' },
    ]);
    expect(published.links[0].link).toBe('https://example.com/game');
    expect(
      published.attachments.map(
        (item) => (item as unknown as { type: string }).type,
      ),
    ).toEqual(['image', 'external_video']);

    expect(await controller.like(created.id, fan)).toEqual({
      liked: true,
      likes_count: 1,
    });
    expect(await controller.like(created.id, fan)).toEqual({
      liked: true,
      likes_count: 1,
    });
    expect(await controller.unlike(created.id, fan)).toEqual({
      liked: false,
      likes_count: 0,
    });

    const draftV2 = await controller.update(created.id, owner, {
      title: 'Version Two',
      authors: [{ type: GameAuthorType.Text, name: 'New Team' }],
      attachments: [],
    });
    expect(draftV2.version).toBe(2);
    expect(draftV2.has_published_version).toBe(true);
    expect((await controller.get(created.id)).title).toBe('Published Version');

    await controller.submit(created.id, owner);
    await controller.publish(created.id, reviewer, {});
    const republished = await controller.get(created.id);
    expect(republished.title).toBe('Version Two');
    expect(republished.authors).toEqual([
      { type: GameAuthorType.Text, name: 'New Team' },
    ]);
    expect(republished.attachments).toEqual([]);

    const textOnly = await controller.create(owner, {
      title: 'Text Team Game',
      description: 'Second project',
      release_date: '2026-08-01',
      genre_ids: [puzzle.id],
      authors: [{ type: GameAuthorType.Text, name: 'No Discord Studio' }],
      links: [],
      attachments: [],
    });
    await controller.submit(textOnly.id, owner);
    await controller.publish(textOnly.id, reviewer, {});

    const catalog = await controller.list({
      limit: 20,
      offset: 0,
      sort: GameListSort.PublishedDesc,
      genre: 'puzzle',
    });
    expect(catalog.total).toBe(2);
    expect(catalog.items[0].id).toBe(textOnly.id);
    expect(
      (catalog.items as unknown as Array<{ id: string }>).map(
        (game) => game.id,
      ),
    ).toContain(textOnly.id);

    await controller.remove(textOnly.id, reviewer);
    await expect(controller.get(textOnly.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
