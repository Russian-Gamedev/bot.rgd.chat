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
import OpenAI from 'openai';
import { pgliteOrmConfig } from '#common/mikro-orm.pglite.config';
import { RedisConnectionService } from '#common/redis.module';
import { DiscordModule } from '#core/discord/discord.module';
import { GameAttachmentEntity } from '#core/games/entities/games.entity';
import { GamesController } from '#core/games/games.controller';
import { GamesService } from '#core/games/games.service';
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
  let gamesService: GamesService;

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
      .overrideProvider(OpenAI)
      .useValue({})
      .overrideModule(DiscordModule)
      .useModule(class {})
      .overrideProvider(PermissionService)
      .useValue(mockPermissionService)
      .compile();

    orm = moduleRef.get(MikroORM);

    await ensureUuidv7Function(orm);

    await orm.schema.refresh();

    controller = moduleRef.get(GamesController);
    gamesService = moduleRef.get(GamesService);

    expect(
      (controller as unknown as Record<string, unknown>).createTag,
    ).toBeUndefined();
    expect(
      (controller as unknown as Record<string, unknown>).updateTag,
    ).toBeUndefined();
    expect(
      (controller as unknown as Record<string, unknown>).removeTag,
    ).toBeUndefined();
  });

  beforeEach(async () => {
    await orm.schema.clear();
    orm.em.clear();
  });

  afterAll(async () => {
    await orm?.close(true);
  });

  it('covers creation variants, review, publication, likes and republishing', async () => {
    const created = await controller.create(owner, {
      title: 'Version One',
      description: '# Initial markdown',
      release_date: '2026-07-11',
      promo: 'Скоро релиз!',
      hide_owner: true,
      tags: ['Action', 'Puzzle'],
      authors: [
        {
          type: GameAuthorType.Discord,
          discord_user_id: owner.id,
          role: 'Программист',
        },
        {
          type: GameAuthorType.Text,
          name: 'External Team',
          role: 'Художник',
        },
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

    expect(created.workflow.status).toBe(GameRevisionStatus.Draft);
    expect(created.workflow.version).toBe(1);
    expect(created.slug).toBe('version-one');
    expect(created.credits.authors).toHaveLength(2);
    expect(created.resources.attachments).toHaveLength(2);
    expect(created.metadata.published_at).toBeNull();
    expect(created.metadata.promo).toBe('Скоро релиз!');
    expect(created.tags.every((tag) => !('id' in tag))).toBe(true);
    await expect(controller.get(created.id)).rejects.toThrow();

    await controller.update(created.id, owner, {
      description: '# Ready for review',
    });
    await controller.submit(created.id, owner);
    const editorUnderReview = await controller.editor(created.id, owner);
    expect(await controller.reviewOne(created.id, reviewer)).toEqual(
      editorUnderReview,
    );
    expect(editorUnderReview.workflow.status).toBe(GameRevisionStatus.Review);
    expect(editorUnderReview.resources.attachments).toHaveLength(2);
    expect(editorUnderReview.credits.owner_id).toBe(owner.id);
    expect(editorUnderReview.credits.hide_owner).toBe(true);
    expect(editorUnderReview.stats.likes_count).toBe(0);
    for (const oldField of [
      'image',
      'authors',
      'owner_id',
      'attachments',
      'links',
      'release_date',
      'published_at',
      'updated_at',
      'likes_count',
      'status',
      'version',
      'review_events',
    ]) {
      expect(oldField in editorUnderReview).toBe(false);
    }
    expect(
      (await controller.reviewList({ limit: 20, offset: 0 })).items,
    ).toHaveLength(1);

    const returned = await controller.changes(created.id, reviewer, {
      comment: 'Please improve the title.',
    });
    expect(returned.workflow.status).toBe(GameRevisionStatus.Draft);
    expect(
      returned.workflow.review_events.map(
        (event) => (event as unknown as { action: string }).action,
      ),
    ).toEqual(['submitted', 'changes_requested']);

    await controller.update(created.id, owner, { title: 'Published Version' });
    await controller.submit(created.id, owner);
    await controller.publish(created.id, reviewer, {
      comment: 'Approved.',
    });

    const published = await controller.get(created.id);
    expect(await controller.get(created.slug)).toEqual(published);
    expect(published.title).toBe('Published Version');
    expect(published.thumbnail).toBe('https://example.com/cover.png');
    expect(published.credits.authors).toEqual([
      {
        type: GameAuthorType.Discord,
        discord_user_id: owner.id,
        role: 'Программист',
      },
      {
        type: GameAuthorType.Text,
        name: 'External Team',
        role: 'Художник',
      },
    ]);
    expect(published.credits.owner_id).toBeNull();
    expect(published.credits.hide_owner).toBe(true);
    expect(published.resources.links[0].link).toBe('https://example.com/game');
    expect(
      published.resources.attachments.map(
        (item) => (item as unknown as { type: string }).type,
      ),
    ).toEqual(['image', 'external_video']);
    expect(published.metadata.release_date).toBe('2026-07-11');
    expect(published.metadata.promo).toBe('Скоро релиз!');
    expect(published.stats.likes_count).toBe(0);
    expect(published.tags.every((tag) => !('id' in tag))).toBe(true);
    for (const oldField of [
      'image',
      'authors',
      'owner_id',
      'attachments',
      'links',
      'release_date',
      'published_at',
      'updated_at',
      'likes_count',
    ]) {
      expect(oldField in published).toBe(false);
    }

    await orm.em.nativeDelete(GameAttachmentEntity, {
      revision: { game: created.id },
      type: GameAttachmentType.Image,
    });
    orm.em.clear();
    expect((await controller.get(created.id)).thumbnail).toBeNull();

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

    await expect(
      controller.update(created.id, owner, { attachments: [] }),
    ).rejects.toThrow('At least one image attachment is required.');
    const draftV2 = await controller.update(created.id, owner, {
      title: 'Version Two',
      slug: 'version-two-custom',
      promo: 'Релиз уже состоялся!',
      hide_owner: false,
      authors: [
        {
          type: GameAuthorType.Text,
          name: 'New Team',
          role: 'Разработчик',
        },
      ],
      attachments: [
        {
          type: GameAttachmentType.Image,
          url: 'https://example.com/version-two.png',
        },
      ],
    });
    expect(draftV2.workflow.version).toBe(2);
    expect(draftV2.slug).toBe('version-two-custom');
    expect(draftV2.workflow.has_published_version).toBe(true);
    expect((await controller.get(created.id)).title).toBe('Published Version');
    expect((await controller.get(created.id)).metadata.promo).toBe(
      'Скоро релиз!',
    );
    expect((await controller.get('version-two-custom')).id).toBe(created.id);

    await controller.submit(created.id, owner);
    await controller.publish(created.id, reviewer, {});
    const republished = await controller.get(created.id);
    expect(republished.title).toBe('Version Two');
    expect(republished.credits.authors).toEqual([
      {
        type: GameAuthorType.Text,
        name: 'New Team',
        role: 'Разработчик',
      },
    ]);
    expect(republished.credits.owner_id).toBe(owner.id);
    expect(republished.credits.hide_owner).toBe(false);
    expect(republished.metadata.promo).toBe('Релиз уже состоялся!');
    expect(republished.resources.attachments).toEqual([
      {
        type: GameAttachmentType.Image,
        url: 'https://example.com/version-two.png',
      },
    ]);

    const textOnly = await controller.create(owner, {
      title: 'Text Team Game',
      description: 'Second project',
      release_date: '2026-08-01',
      hide_owner: true,
      tags: ['Puzzle'],
      authors: [
        {
          type: GameAuthorType.Text,
          name: 'No Discord Studio',
          role: 'Команда разработки',
        },
      ],
      links: [],
      attachments: [
        {
          type: GameAttachmentType.Image,
          url: 'https://example.com/text-team.png',
        },
      ],
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
      { name: 'Action', slug: 'action' },
      { name: 'Puzzle', slug: 'puzzle' },
    ]);
    expect(catalog.items[0].id).toBe(textOnly.id);
    expect(catalog.items[0].thumbnail).toBe(
      'https://example.com/text-team.png',
    );
    expect(catalog.items[0].tags.every((tag) => !('id' in tag))).toBe(true);
    expect('image' in catalog.items[0]).toBe(false);
    expect(
      (catalog.items as unknown as Array<{ id: string }>).map(
        (game) => game.id,
      ),
    ).toContain(textOnly.id);

    const profileGames = await gamesService.listByUser(owner.id, {
      limit: 20,
      offset: 0,
      sort: GameListSort.PublishedDesc,
    });
    expect(profileGames.items.map((game) => game.id)).toContain(created.id);
    expect(profileGames.items.map((game) => game.id)).not.toContain(
      textOnly.id,
    );

    await controller.remove(textOnly.id, reviewer);
    await expect(controller.get(textOnly.id)).rejects.toThrow();
  });
});
