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
import { S3StorageService } from '#common/s3/s3-storage.service';
import { DiscordModule } from '#core/discord/discord.module';
import { PermissionService } from '#core/permissions/permissions.service';
import type { AuthenticatedActor } from '#core/permissions/permissions.types';
import { ActorType } from '#core/permissions/permissions.types';
import { ProjectAttachmentEntity } from '#core/projects/entities/projects.entity';
import { ProjectsController } from '#core/projects/projects.controller';
import { ProjectsService } from '#core/projects/projects.service';
import {
  ProjectAttachmentType,
  ProjectAuthorType,
  ProjectListSort,
  ProjectRevisionStatus,
  ProjectType,
  ProjectUploadKind,
} from '#core/projects/projects.types';
import { AppModule } from '#root/app.module';
import { MockExternalServicesModule } from './helpers/mock-modules';
import { MockRedis } from './helpers/mock-redis';
import { ensureUuidv7Function } from './helpers/pglite-setup';

describe('Projects full integration flow', () => {
  let orm: MikroORM;
  let controller: ProjectsController;
  let projectsService: ProjectsService;

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
  const mockStorage = {
    getPresignedPutUrl: async () => 'https://s3.example/presigned-put',
    getPublicUrl: (key: string) => `https://cdn.example/${key}`,
    headObject: async () => ({ contentLength: 1024 }),
    uploadObject: async () => undefined,
    deleteObject: async () => undefined,
  } as unknown as S3StorageService;

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
      .overrideProvider(S3StorageService)
      .useValue(mockStorage)
      .overrideModule(DiscordModule)
      .useModule(class {})
      .overrideProvider(PermissionService)
      .useValue(mockPermissionService)
      .compile();

    orm = moduleRef.get(MikroORM);

    await ensureUuidv7Function(orm);

    await orm.schema.refresh();

    controller = moduleRef.get(ProjectsController);
    projectsService = moduleRef.get(ProjectsService);

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

  const upload = async (
    actor: AuthenticatedActor,
    kind: ProjectUploadKind = ProjectUploadKind.Attachment,
  ) => {
    const created = await controller.createUpload(actor, {
      kind,
      content_type: 'image/png',
      size_bytes: 1024,
    });
    return controller.completeUpload(created.upload.id, actor);
  };

  it('covers creation variants, review, publication, likes and republishing', async () => {
    const banner = await upload(owner, ProjectUploadKind.Banner);
    // Шаг 1: черновик создаётся с минимальными данными мастера.
    const created = await controller.create(owner, {
      title: 'Version One',
      description: '# Initial markdown',
      release_date: '2026-07-11',
      promo: 'Скоро релиз!',
      hide_owner: true,
      banner_upload_id: banner.id,
    });

    expect(created.workflow.status).toBe(ProjectRevisionStatus.Draft);
    expect(created.workflow.version).toBe(1);
    expect(created.slug).toBe('version-one');
    expect(created.metadata.type).toBe(ProjectType.Game);
    expect(created.credits.authors).toEqual([]);
    expect(created.resources.attachments).toEqual([]);
    expect(created.banner_url).toBe(banner.url);
    expect(created.thumbnail).toBe(banner.url);
    expect(created.metadata.published_at).toBeNull();
    expect(created.metadata.promo).toBe('Скоро релиз!');
    await expect(controller.get(created.id)).rejects.toThrow();

    // До категоризации и команды сабмит невозможен.
    await expect(controller.submit(created.id, owner)).rejects.toThrow(
      'A project must have at least one author and one tag before review.',
    );

    // Шаг 2: категоризация.
    await controller.update(created.id, owner, { tags: ['Action', 'Puzzle'] });
    await expect(controller.submit(created.id, owner)).rejects.toThrow(
      'A project must have at least one author and one tag before review.',
    );

    // Шаг 3: команда. Вложений нет — обложки из шага 1 достаточно.
    await controller.update(created.id, owner, {
      authors: [
        {
          type: ProjectAuthorType.Discord,
          discord_user_id: owner.id,
          role: 'Программист',
        },
        {
          type: ProjectAuthorType.Text,
          name: 'External Team',
          role: 'Художник',
        },
      ],
    });
    await controller.submit(created.id, owner);
    const editorUnderReview = await controller.editor(created.id, owner);
    expect(await controller.reviewOne(created.id, reviewer)).toEqual(
      editorUnderReview,
    );
    expect(editorUnderReview.workflow.status).toBe(
      ProjectRevisionStatus.Review,
    );
    expect(editorUnderReview.resources.attachments).toHaveLength(0);
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
    expect(returned.workflow.status).toBe(ProjectRevisionStatus.Draft);
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
    expect(published.thumbnail).toBe(banner.url);
    expect(published.banner_url).toBe(banner.url);
    expect(published.credits.authors).toEqual([
      {
        type: ProjectAuthorType.Discord,
        discord_user_id: owner.id,
        role: 'Программист',
      },
      {
        type: ProjectAuthorType.Text,
        name: 'External Team',
        role: 'Художник',
      },
    ]);
    expect(published.credits.owner_id).toBeNull();
    expect(published.credits.hide_owner).toBe(true);
    expect(published.resources.links).toEqual([]);
    expect(published.resources.attachments).toEqual([]);
    expect(published.metadata.release_date).toBe('2026-07-11');
    expect(published.metadata.type).toBe(ProjectType.Game);
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

    // Шаг 4: ссылки; шаг 5: вложения (картинка из S3 + внешнее видео).
    const coverV2 = await upload(owner);
    const bannerV2 = await upload(owner, ProjectUploadKind.Banner);
    const draftV2 = await controller.update(created.id, owner, {
      title: 'Version Two',
      slug: 'version-two-custom',
      promo: 'Релиз уже состоялся!',
      hide_owner: false,
      banner_upload_id: bannerV2.id,
      links: [
        {
          icon: 'website',
          label: 'Website',
          link: 'https://example.com/project',
        },
      ],
      authors: [
        {
          type: ProjectAuthorType.Text,
          name: 'New Team',
          role: 'Разработчик',
        },
      ],
      attachments: [
        {
          type: ProjectAttachmentType.Image,
          upload_id: coverV2.id,
        },
        {
          type: ProjectAttachmentType.ExternalVideo,
          url: 'https://example.com/trailer',
        },
      ],
    });
    expect(draftV2.workflow.version).toBe(2);
    expect(draftV2.slug).toBe('version-two-custom');
    expect(draftV2.workflow.has_published_version).toBe(true);
    expect(draftV2.banner_url).toBe(bannerV2.url);
    // Баннер имеет приоритет над вложением-обложкой.
    expect(draftV2.thumbnail).toBe(bannerV2.url);
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
        type: ProjectAuthorType.Text,
        name: 'New Team',
        role: 'Разработчик',
      },
    ]);
    expect(republished.credits.owner_id).toBe(owner.id);
    expect(republished.credits.hide_owner).toBe(false);
    expect(republished.metadata.promo).toBe('Релиз уже состоялся!');
    expect(republished.banner_url).toBe(bannerV2.url);
    expect(republished.thumbnail).toBe(bannerV2.url);
    expect(republished.resources.attachments).toEqual([
      {
        type: ProjectAttachmentType.Image,
        url: coverV2.url,
        upload_id: coverV2.id,
      },
      {
        type: ProjectAttachmentType.ExternalVideo,
        url: 'https://example.com/trailer',
      },
    ]);

    const textBanner = await upload(owner, ProjectUploadKind.Banner);
    const textOnly = await controller.create(owner, {
      title: 'Text Team Project',
      description: 'Second project',
      release_date: '2026-08-01',
      type: ProjectType.Tool,
      hide_owner: true,
      banner_upload_id: textBanner.id,
      tags: ['Puzzle'],
      authors: [
        {
          type: ProjectAuthorType.Text,
          name: 'No Discord Studio',
          role: 'Команда разработки',
        },
      ],
      links: [],
    });
    await controller.submit(textOnly.id, owner);
    await controller.publish(textOnly.id, reviewer, {});

    const catalog = await controller.list({
      limit: 20,
      offset: 0,
      sort: ProjectListSort.PublishedDesc,
      tag: 'puzzle',
    });
    expect(catalog.total).toBe(2);
    expect(await controller.getTags()).toEqual([
      { name: 'Action', slug: 'action' },
      { name: 'Puzzle', slug: 'puzzle' },
    ]);
    expect(catalog.items[0].id).toBe(textOnly.id);
    expect(catalog.items[0].type).toBe(ProjectType.Tool);
    expect(catalog.items[0].thumbnail).toBe(textBanner.url);
    expect(catalog.items[0].banner_url).toBe(textBanner.url);
    expect(catalog.items[0].tags.every((tag) => !('id' in tag))).toBe(true);
    expect('image' in catalog.items[0]).toBe(false);
    expect(
      (catalog.items as unknown as Array<{ id: string }>).map(
        (project) => project.id,
      ),
    ).toContain(textOnly.id);

    const toolCatalog = await controller.list({
      limit: 20,
      offset: 0,
      sort: ProjectListSort.PublishedDesc,
      type: ProjectType.Tool,
    });
    expect(toolCatalog.items.map((project) => project.id)).toEqual([
      textOnly.id,
    ]);
    const gameCatalog = await controller.list({
      limit: 20,
      offset: 0,
      sort: ProjectListSort.PublishedDesc,
      type: ProjectType.Game,
    });
    expect(gameCatalog.items.map((project) => project.id)).toEqual([
      created.id,
    ]);

    const mineTools = await controller.mine(owner, {
      limit: 20,
      offset: 0,
      type: ProjectType.Tool,
    });
    expect(mineTools.items.map((item) => item.id)).toEqual([textOnly.id]);
    expect(
      (await controller.mine(fan, { limit: 20, offset: 0 })).items,
    ).toHaveLength(0);

    const profileProjects = await projectsService.listByUser(owner.id, {
      limit: 20,
      offset: 0,
      sort: ProjectListSort.PublishedDesc,
    });
    expect(profileProjects.items.map((project) => project.id)).toContain(
      created.id,
    );
    expect(profileProjects.items.map((project) => project.id)).not.toContain(
      textOnly.id,
    );

    await controller.remove(textOnly.id, reviewer);
    await expect(controller.get(textOnly.id)).rejects.toThrow();
  });

  it('enforces upload ownership, completion and kind at bind time', async () => {
    const foreign = await upload(owner);
    const payload = (uploadId: string) => ({
      title: 'Upload Rules',
      description: 'desc',
      release_date: '2026-09-01',
      type: ProjectType.Other,
      tags: ['Action'],
      authors: [
        {
          type: ProjectAuthorType.Text,
          name: 'Team',
          role: 'Автор',
        },
      ],
      attachments: [{ type: ProjectAttachmentType.Image, upload_id: uploadId }],
    });

    await expect(controller.create(fan, payload(foreign.id))).rejects.toThrow(
      'Only the uploader can use this upload.',
    );

    await expect(
      controller.create(owner, {
        ...payload(foreign.id),
        banner_upload_id: foreign.id,
      }),
    ).rejects.toThrow('The upload kind does not match its destination.');

    const pending = await controller.createUpload(owner, {
      kind: ProjectUploadKind.Attachment,
      content_type: 'image/png',
      size_bytes: 1024,
    });
    await expect(
      controller.create(owner, payload(pending.upload.id)),
    ).rejects.toThrow('The file has not been uploaded yet.');

    await controller.deleteUpload(pending.upload.id, owner);
    await expect(
      controller.completeUpload(pending.upload.id, owner),
    ).rejects.toThrow('Project upload was not found.');
  });
});
