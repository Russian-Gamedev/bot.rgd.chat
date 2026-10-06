import {
  type EntityManager,
  type FilterQuery,
  type Loaded,
  LockMode,
  raw,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityRepository,
  EntityManager as PostgreSqlEntityManager,
} from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  CreateProjectDto,
  MineProjectsQueryDto,
  ProjectListQueryDto,
  UpdateProjectDto,
} from './dto/projects.dto';
import {
  ProjectAttachmentEntity,
  ProjectAuthorEntity,
  ProjectEntity,
  ProjectLikeEntity,
  ProjectLinkEntity,
  ProjectReviewEventEntity,
  ProjectRevisionEntity,
  ProjectRevisionTagEntity,
} from './entities/projects.entity';
import { ProjectTagsService } from './project-tags.service';
import { createProjectSlug, normalizeProjectSlug } from './projects.slug';
import {
  ProjectAttachmentType,
  ProjectAuthorType,
  ProjectListSort,
  ProjectReviewAction,
  ProjectRevisionStatus,
} from './projects.types';

const PROJECT_POPULATE = [
  'publishedRevision.authors',
  'publishedRevision.tagLinks.tag',
  'publishedRevision.links',
  'publishedRevision.attachments',
  'workingRevision.authors',
  'workingRevision.tagLinks.tag',
  'workingRevision.links',
  'workingRevision.attachments',
] as const;
const EDITOR_POPULATE = [...PROJECT_POPULATE, 'reviewEvents.revision'] as const;

type PopulatedRevision = Loaded<
  ProjectRevisionEntity,
  'authors' | 'tagLinks.tag' | 'links' | 'attachments'
>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly em: PostgreSqlEntityManager,
    @InjectRepository(ProjectEntity)
    private readonly projects: EntityRepository<ProjectEntity>,
    @InjectRepository(ProjectLikeEntity)
    private readonly likes: EntityRepository<ProjectLikeEntity>,
    private readonly tags: ProjectTagsService,
  ) {}

  async list(query: ProjectListQueryDto, userId?: string) {
    const revisionWhere: FilterQuery<ProjectRevisionEntity> = {};
    if (query.tag) revisionWhere.tagLinks = { tag: { slug: query.tag } };
    if (query.author_id) {
      revisionWhere.authors = { discord_user_id: BigInt(query.author_id) };
    }
    if (query.type) revisionWhere.type = query.type;
    if (query.search) revisionWhere.title = { $ilike: `%${query.search}%` };
    if (query.release_from || query.release_to) {
      revisionWhere.release_date = {
        ...(query.release_from ? { $gte: query.release_from } : {}),
        ...(query.release_to ? { $lte: query.release_to } : {}),
      };
    }
    const where: FilterQuery<ProjectEntity> = {
      publishedRevision: { $ne: null, ...revisionWhere },
    };
    if (userId) {
      const discordUserId = BigInt(userId);
      where.$or = [
        {
          owner_id: discordUserId,
          publishedRevision: { hide_owner: false },
        },
        {
          publishedRevision: {
            authors: { discord_user_id: discordUserId },
          },
        },
      ];
    }
    const [projects, total] = await this.projects.findAndCount(where, {
      populate: PROJECT_POPULATE,
      limit: query.limit,
      offset: query.offset,
      orderBy: this.publicOrder(query.sort),
    });
    const counts = await this.likeCounts(projects);
    return {
      items: projects.map((project) =>
        this.listItem(
          project,
          project.publishedRevision as PopulatedRevision,
          counts,
        ),
      ),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  listByUser(userId: string, query: Omit<ProjectListQueryDto, 'author_id'>) {
    return this.list(query, userId);
  }

  async getPublic(idOrSlug: string) {
    const lookup = isUuid(idOrSlug)
      ? { id: idOrSlug }
      : { slug: idOrSlug.toLocaleLowerCase('ru-RU') };
    const project = await this.projects.findOne(
      { ...lookup, publishedRevision: { $ne: null } },
      { populate: PROJECT_POPULATE },
    );
    if (!project?.publishedRevision)
      throw new NotFoundException('Project not found.');
    return this.details(
      project,
      project.publishedRevision as PopulatedRevision,
      await this.likes.count({ project }),
    );
  }

  async create(ownerId: string, dto: CreateProjectDto) {
    this.assertImageAttachmentInput(dto.attachments, true);
    try {
      return await this.em.transactional(async (em) => {
        const slug = normalizeProjectSlug(
          dto.slug ?? createProjectSlug(dto.title),
        );
        await this.assertSlugAvailable(em, slug);
        const project = Object.assign(new ProjectEntity(), {
          owner_id: BigInt(ownerId),
          slug,
        });
        const revision = Object.assign(new ProjectRevisionEntity(), {
          project,
          version: 1,
          status: ProjectRevisionStatus.Draft,
          title: dto.title,
          description: dto.description,
          release_date: dto.release_date,
          type: dto.type,
          promo: dto.promo ?? null,
          hide_owner: dto.hide_owner ?? false,
          created_by: BigInt(ownerId),
        });
        project.revisions.add(revision);
        project.workingRevision = revision;
        await this.applyChildren(em, revision, dto);
        em.persist(project);
        await em.flush();
        return this.editorDto(project, revision as PopulatedRevision, [], 0);
      });
    } catch (error) {
      this.rethrowSlugConflict(error);
    }
  }

  async listMine(ownerId: string, query: MineProjectsQueryDto) {
    const where: FilterQuery<ProjectEntity> = { owner_id: BigInt(ownerId) };
    if (query.status || query.type) {
      const shownRevision = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
      };
      where.$or = [
        { workingRevision: shownRevision },
        { workingRevision: null, publishedRevision: shownRevision },
      ];
    }
    const [projects, total] = await this.projects.findAndCount(where, {
      populate: PROJECT_POPULATE,
      orderBy: { updatedAt: 'desc' },
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: projects.map((project) => {
        const revision = project.workingRevision ?? project.publishedRevision;
        return {
          id: project.id,
          slug: project.slug,
          owner_id: project.owner_id.toString(),
          revision_id: revision?.id,
          title: revision?.title,
          type: revision?.type,
          status: revision?.status,
          version: revision?.version,
          has_published_version: Boolean(project.publishedRevision),
        };
      }),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getEditor(
    id: string,
    actorId: string,
    reviewer: boolean,
    em?: EntityManager,
  ) {
    const manager = em ?? this.em;
    const project = await manager.findOne(ProjectEntity, id, {
      populate: EDITOR_POPULATE,
    });
    if (!project) throw new NotFoundException('Project not found.');
    this.assertOwner(project, actorId, reviewer);
    const revision = project.workingRevision ?? project.publishedRevision;
    if (!revision) throw new NotFoundException('Project revision not found.');
    const events = project.reviewEvents
      .getItems()
      .sort(
        (left, right) => left.created_at.getTime() - right.created_at.getTime(),
      );
    return this.editorDto(
      project,
      revision as PopulatedRevision,
      events,
      await manager.count(ProjectLikeEntity, { project }),
    );
  }

  async update(id: string, ownerId: string, dto: UpdateProjectDto) {
    this.assertImageAttachmentInput(dto.attachments, false);
    try {
      return await this.em.transactional(async (em) => {
        const project = await em.findOne(ProjectEntity, id, {
          populate: EDITOR_POPULATE,
          lockMode: LockMode.PESSIMISTIC_WRITE,
        });
        if (!project) throw new NotFoundException('Project not found.');
        this.assertOwner(project, ownerId, false);
        if (dto.slug !== undefined) {
          const slug = normalizeProjectSlug(dto.slug);
          await this.assertSlugAvailable(em, slug, project.id);
          project.slug = slug;
        }
        let revision = project.workingRevision as PopulatedRevision | null;
        if (!revision) {
          if (!project.publishedRevision) {
            throw new ConflictException('Project has no revision to edit.');
          }
          const published = project.publishedRevision as PopulatedRevision;
          revision = Object.assign(new ProjectRevisionEntity(), {
            project,
            version: published.version + 1,
            status: ProjectRevisionStatus.Draft,
            title: published.title,
            description: published.description,
            release_date: published.release_date,
            type: published.type,
            promo: published.promo,
            hide_owner: published.hide_owner,
            created_by: BigInt(ownerId),
          }) as unknown as PopulatedRevision;
          project.revisions.add(revision);
          project.workingRevision = revision;
          await this.cloneChildren(published, revision);
        }
        if (revision.status === ProjectRevisionStatus.Review) {
          throw new ConflictException('Project is currently under review.');
        }
        if (dto.title !== undefined) revision.title = dto.title;
        if (dto.description !== undefined)
          revision.description = dto.description;
        if (dto.release_date !== undefined)
          revision.release_date = dto.release_date;
        if (dto.type !== undefined) revision.type = dto.type;
        if (dto.promo !== undefined) revision.promo = dto.promo;
        if (dto.hide_owner !== undefined) revision.hide_owner = dto.hide_owner;
        await this.applyChildren(em, revision, dto, true);
        await em.flush();
        return this.getEditor(id, ownerId, false, em);
      });
    } catch (error) {
      this.rethrowSlugConflict(error);
    }
  }

  async submit(id: string, ownerId: string) {
    return this.em.transactional(async (em) => {
      const project = await em.findOne(ProjectEntity, id, {
        populate: EDITOR_POPULATE,
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!project) throw new NotFoundException('Project not found.');
      this.assertOwner(project, ownerId, false);
      const revision = project.workingRevision as PopulatedRevision | null;
      if (!revision || revision.status !== ProjectRevisionStatus.Draft) {
        throw new ConflictException('Only a draft can be submitted.');
      }
      if (revision.authors.length === 0 || revision.tagLinks.length === 0) {
        throw new ConflictException(
          'A project must have at least one author and one tag before review.',
        );
      }
      if (
        !revision.attachments
          .getItems()
          .some((attachment) => attachment.type === ProjectAttachmentType.Image)
      ) {
        throw new ConflictException(
          'A project must have at least one image attachment before review.',
        );
      }
      revision.status = ProjectRevisionStatus.Review;
      revision.submitted_at = new Date();
      const event = Object.assign(new ProjectReviewEventEntity(), {
        project,
        revision,
        action: ProjectReviewAction.Submitted,
        actor_id: BigInt(ownerId),
      });
      project.reviewEvents.add(event);
      await em.flush();
      return this.getEditor(id, ownerId, false, em);
    });
  }

  async remove(id: string, actorId: string, reviewer: boolean) {
    const project = await this.projects.findOne(id, {
      populate: ['publishedRevision'],
    });
    if (!project) throw new NotFoundException('Project not found.');
    if (project.publishedRevision && !reviewer) {
      throw new ForbiddenException(
        'Published projects can only be deleted by reviewers.',
      );
    }
    this.assertOwner(project, actorId, reviewer);
    this.em.remove(project);
    await this.em.flush();
  }

  private publicOrder(sort: ProjectListSort) {
    if (sort === ProjectListSort.ReleaseDateAsc) {
      return { publishedRevision: { release_date: 'asc' as const } };
    }
    if (sort === ProjectListSort.ReleaseDateDesc) {
      return { publishedRevision: { release_date: 'desc' as const } };
    }
    return { publishedRevision: { published_at: 'desc' as const } };
  }

  private async likeCounts(projects: ProjectEntity[]) {
    const counts = new Map<string, number>();
    if (!projects.length) return counts;
    const rows = await this.likes
      .createQueryBuilder('like')
      .select(['like.project', raw('count(*) as count')])
      .where({ project: { $in: projects } })
      .groupBy('like.project')
      .execute<{ project: string; count: string }[]>();
    for (const row of rows) counts.set(row.project, Number(row.count));
    return counts;
  }

  private listItem(
    project: ProjectEntity,
    revision: PopulatedRevision,
    counts: Map<string, number>,
  ) {
    return {
      id: project.id,
      slug: project.slug,
      title: revision.title,
      type: revision.type,
      release_date: String(revision.release_date).slice(0, 10),
      tags: this.publicTagDtos(revision),
      authors: this.authorDtos(revision),
      thumbnail: this.thumbnail(revision),
      likes_count: counts.get(project.id) ?? 0,
      published_at: revision.published_at,
    };
  }

  private details(
    project: ProjectEntity,
    revision: PopulatedRevision,
    likes: number,
    exposeOwner = false,
  ) {
    return {
      id: project.id,
      slug: project.slug,
      title: revision.title,
      description: revision.description,
      thumbnail: this.thumbnail(revision),
      tags: this.publicTagDtos(revision),
      credits: {
        owner_id:
          exposeOwner || !revision.hide_owner
            ? project.owner_id.toString()
            : null,
        hide_owner: revision.hide_owner,
        authors: this.authorDtos(revision),
      },
      resources: {
        attachments: this.attachmentDtos(revision),
        links: this.linkDtos(revision),
      },
      metadata: {
        release_date: String(revision.release_date).slice(0, 10),
        type: revision.type,
        promo: revision.promo,
        published_at: revision.published_at,
        updated_at: revision.updatedAt,
      },
      stats: { likes_count: likes },
    };
  }

  private editorDto(
    project: ProjectEntity,
    revision: PopulatedRevision,
    events: ProjectReviewEventEntity[],
    likes: number,
  ) {
    return {
      ...this.details(project, revision, likes, true),
      workflow: {
        status: revision.status,
        version: revision.version,
        has_published_version: Boolean(project.publishedRevision),
        published_version: project.publishedRevision?.version ?? null,
        review_events: events.map((event) => ({
          id: event.id,
          revision_id: event.revision.id,
          action: event.action,
          actor_id: event.actor_id.toString(),
          comment: event.comment,
          created_at: event.created_at,
        })),
      },
    };
  }

  private authorDtos(revision: PopulatedRevision) {
    return revision.authors
      .getItems()
      .sort((a, b) => a.position - b.position)
      .map((author) =>
        author.type === ProjectAuthorType.Discord
          ? {
              type: author.type,
              discord_user_id: author.discord_user_id?.toString(),
              role: author.role,
            }
          : { type: author.type, name: author.name, role: author.role },
      );
  }

  private publicTagDtos(revision: PopulatedRevision) {
    return revision.tagLinks.getItems().map(({ tag }) => ({
      slug: tag.slug,
      name: tag.name,
    }));
  }

  private thumbnail(revision: PopulatedRevision) {
    return (
      revision.attachments
        .getItems()
        .sort((a, b) => a.position - b.position)
        .find((attachment) => attachment.type === ProjectAttachmentType.Image)
        ?.url ?? null
    );
  }

  private attachmentDtos(revision: PopulatedRevision) {
    return revision.attachments
      .getItems()
      .sort((a, b) => a.position - b.position)
      .map(({ type, url }) => ({ type, url }));
  }

  private linkDtos(revision: PopulatedRevision) {
    return revision.links
      .getItems()
      .sort((a, b) => a.position - b.position)
      .map(({ icon, label, link }) => ({ icon, label, link }));
  }

  private async applyChildren(
    em: EntityManager,
    revision: ProjectRevisionEntity,
    dto: UpdateProjectDto,
    partial = false,
  ) {
    if (!partial || dto.tags !== undefined) {
      const tags = await this.tags.ensure(dto.tags ?? [], em);
      if (revision.id) {
        await em.nativeDelete(ProjectRevisionTagEntity, {
          revision: revision.id,
        });
      }
      revision.tagLinks.set(
        tags.map((tag) =>
          Object.assign(new ProjectRevisionTagEntity(), { revision, tag }),
        ),
      );
    }
    if (!partial || dto.authors !== undefined) {
      if (revision.id) {
        await em.nativeDelete(ProjectAuthorEntity, { revision: revision.id });
      }
      revision.authors.set(
        (dto.authors ?? []).map((author, position) =>
          Object.assign(new ProjectAuthorEntity(), {
            revision,
            type: author.type,
            discord_user_id: author.discord_user_id
              ? BigInt(author.discord_user_id)
              : null,
            name: author.name ?? null,
            role: author.role,
            position,
          }),
        ),
      );
    }
    if (!partial || dto.links !== undefined) {
      if (revision.id) {
        await em.nativeDelete(ProjectLinkEntity, { revision: revision.id });
      }
      revision.links.set(
        (dto.links ?? []).map((link, position) =>
          Object.assign(new ProjectLinkEntity(), {
            revision,
            ...link,
            position,
          }),
        ),
      );
    }
    if (!partial || dto.attachments !== undefined) {
      const attachments = dto.attachments ?? [];
      if (revision.id) {
        await em.nativeDelete(ProjectAttachmentEntity, {
          revision: revision.id,
        });
      }
      revision.attachments.set(
        attachments.map((attachment, position) =>
          Object.assign(new ProjectAttachmentEntity(), {
            revision,
            ...attachment,
            position,
          }),
        ),
      );
    }
  }

  private async cloneChildren(
    source: PopulatedRevision,
    target: ProjectRevisionEntity,
  ) {
    target.tagLinks.set(
      source.tagLinks.getItems().map(({ tag }) =>
        Object.assign(new ProjectRevisionTagEntity(), {
          revision: target,
          tag,
        }),
      ),
    );
    target.authors.set(
      source.authors.getItems().map((author) =>
        Object.assign(new ProjectAuthorEntity(), {
          revision: target,
          type: author.type,
          discord_user_id: author.discord_user_id,
          name: author.name,
          role: author.role,
          position: author.position,
        }),
      ),
    );
    target.links.set(
      source.links.getItems().map((link) =>
        Object.assign(new ProjectLinkEntity(), {
          revision: target,
          icon: link.icon,
          label: link.label,
          link: link.link,
          position: link.position,
        }),
      ),
    );
    target.attachments.set(
      source.attachments.getItems().map((attachment) =>
        Object.assign(new ProjectAttachmentEntity(), {
          revision: target,
          type: attachment.type,
          url: attachment.url,
          position: attachment.position,
        }),
      ),
    );
  }

  private assertOwner(
    project: ProjectEntity,
    actorId: string,
    reviewer: boolean,
  ) {
    if (!reviewer && project.owner_id.toString() !== actorId) {
      throw new ForbiddenException('Only the owner can access this project.');
    }
  }

  private assertImageAttachmentInput(
    attachments: UpdateProjectDto['attachments'],
    required: boolean,
  ) {
    if (!required && attachments === undefined) return;
    if (
      !(attachments ?? []).some(
        (attachment) => attachment.type === ProjectAttachmentType.Image,
      )
    ) {
      throw new BadRequestException(
        'At least one image attachment is required.',
      );
    }
  }

  private async assertSlugAvailable(
    em: EntityManager,
    slug: string,
    currentProjectId?: string,
  ) {
    const existing = await em.findOne(ProjectEntity, {
      slug,
      ...(currentProjectId ? { id: { $ne: currentProjectId } } : {}),
    });
    if (existing) {
      throw new ConflictException('Project slug is already in use.');
    }
  }

  private rethrowSlugConflict(error: unknown): never {
    if (
      error instanceof UniqueConstraintViolationException &&
      error.message.includes('projects_slug_unique')
    ) {
      throw new ConflictException('Project slug is already in use.');
    }
    throw error;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
