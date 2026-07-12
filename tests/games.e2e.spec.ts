import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { MikroORM } from '@mikro-orm/core';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import { pgliteOrmConfig } from '#common/mikro-orm.pglite.config';
import { RedisConnectionService } from '#common/redis.module';
import { DiscordModule } from '#core/discord/discord.module';
import { GamesController } from '#core/games/games.controller';
import {
  GameAttachmentType,
  GameAuthorType,
  GameListSort,
  GameRevisionStatus,
} from '#core/games/games.types';
import { PermissionService } from '#core/permissions/permissions.service';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { ActorType } from '#core/permissions/permissions.types';
import { AppModule } from '#root/app.module';
import { MockExternalServicesModule } from './helpers/mock-modules';
import { MockRedis } from './helpers/mock-redis';
import { ensureUuidv7Function } from './helpers/pglite-setup';

describe('Games full integration flow', () => {
  let orm: MikroORM;
  let controller: GamesController;

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

  const mockRedis = new MockRedis();
  const mockPermissionService = {
    hasPermission: async (actor: AuthenticatedActor) =>
      actor.id === reviewer.id,
  } as unknown as PermissionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.register(pgliteOrmConfig),
        MockExternalServicesModule,
      ],
    })
      .useMocker((_token) => {
        return {};
      })
      .overrideProvider(Redis)
      .useValue(mockRedis)
      .overrideProvider(RedisConnectionService)
      .useValue(new RedisConnectionService(mockRedis as unknown as Redis))
      .overrideModule(DiscordModule)
      .useModule(class {})
      .overrideProvider(PermissionService)
      .useValue(mockPermissionService)
      .compile();

    orm = moduleRef.get(MikroORM);

    await ensureUuidv7Function(orm);

    await orm.schema.refresh();

    controller = moduleRef.get(GamesController);
  });

  beforeEach(async () => {
    await orm.schema.clear();
    orm.em.clear();
  });

  afterAll(async () => {
    await orm.close(true);
  });

  it('covers creation variants, review, publication, likes and republishing', async () => {
    const created = await controller.create(owner, {
      title: 'Version One',
      description: '# Initial markdown',
      release_date: '2026-07-11',
      tags: ['Action', 'Puzzle'],
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
    await expect(controller.get(created.id)).rejects.toThrow();

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
      tags: ['Puzzle'],
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
      tag: 'puzzle',
    });
    expect(catalog.total).toBe(2);
    expect(await controller.getTags()).toEqual([
      expect.objectContaining({ name: 'Action', slug: 'action' }),
      expect.objectContaining({ name: 'Puzzle', slug: 'puzzle' }),
    ]);
    expect(catalog.items[0].id).toBe(textOnly.id);
    expect(
      (catalog.items as unknown as Array<{ id: string }>).map(
        (game) => game.id,
      ),
    ).toContain(textOnly.id);

    await controller.remove(textOnly.id, reviewer);
    await expect(controller.get(textOnly.id)).rejects.toThrow();
  });
});
