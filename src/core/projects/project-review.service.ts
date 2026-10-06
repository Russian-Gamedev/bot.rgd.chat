import {
  type EntityManager,
  type FilterQuery,
  LockMode,
} from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityRepository,
  EntityManager as PostgreSqlEntityManager,
} from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { ProjectReviewListQueryDto } from './dto/projects.dto';
import {
  ProjectEntity,
  ProjectReviewEventEntity,
  ProjectRevisionEntity,
} from './entities/projects.entity';
import { ProjectsService } from './projects.service';
import { ProjectReviewAction, ProjectRevisionStatus } from './projects.types';

@Injectable()
export class ProjectReviewService {
  private readonly logger = new Logger(ProjectReviewService.name);

  constructor(
    private readonly em: PostgreSqlEntityManager,
    @InjectRepository(ProjectEntity)
    private readonly projectsRepository: EntityRepository<ProjectEntity>,
    private readonly projects: ProjectsService,
  ) {}

  async list(query: ProjectReviewListQueryDto) {
    const revision: FilterQuery<ProjectRevisionEntity> = {};
    if (query.status) revision.status = query.status;
    if (query.search) revision.title = { $ilike: `%${query.search}%` };
    const where: FilterQuery<ProjectEntity> = query.owner_id
      ? { owner_id: BigInt(query.owner_id) }
      : {};
    if (query.status === ProjectRevisionStatus.Published) {
      where.workingRevision = null;
      where.publishedRevision = revision;
    } else if (query.status || query.search) {
      where.workingRevision = revision;
    }
    const [projects, total] = await this.projectsRepository.findAndCount(
      where,
      {
        populate: ['workingRevision', 'publishedRevision'],
        orderBy: { updatedAt: 'desc' },
        limit: query.limit,
        offset: query.offset,
      },
    );
    return {
      items: projects.map((project) => {
        const current = project.workingRevision ?? project.publishedRevision;
        return {
          id: project.id,
          slug: project.slug,
          owner_id: project.owner_id.toString(),
          revision_id: current?.id,
          version: current?.version,
          status: current?.status,
          title: current?.title,
          submitted_at: current?.submitted_at,
          published_at: current?.published_at,
          updated_at: current?.updatedAt,
        };
      }),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  publish(id: string, actorId: string, comment?: string) {
    return this.transition(id, actorId, ProjectReviewAction.Published, comment);
  }

  requestChanges(id: string, actorId: string, comment: string) {
    return this.transition(
      id,
      actorId,
      ProjectReviewAction.ChangesRequested,
      comment,
    );
  }

  async transferOwner(id: string, ownerId: string) {
    return this.em.transactional(async (em) => {
      const project = await em.findOne(ProjectEntity, id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!project) throw new NotFoundException('Project not found.');
      project.owner_id = BigInt(ownerId);
      await em.flush();
      this.logger.log(
        `Project ${id} owner transferred to Discord user ${ownerId}`,
      );
      return this.projects.getEditor(id, ownerId, true, em);
    });
  }

  private transition(
    id: string,
    actorId: string,
    action:
      | ProjectReviewAction.Published
      | ProjectReviewAction.ChangesRequested,
    comment?: string,
  ) {
    return this.em.transactional(async (em) => {
      const project = await em.findOne(ProjectEntity, id, {
        populate: ['workingRevision', 'reviewEvents'],
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!project) throw new NotFoundException('Project not found.');
      const revision = project.workingRevision;
      if (!revision || revision.status !== ProjectRevisionStatus.Review) {
        throw new ConflictException(
          'Only a revision under review can be processed.',
        );
      }
      if (action === ProjectReviewAction.Published) {
        revision.status = ProjectRevisionStatus.Published;
        revision.published_at = new Date();
        project.publishedRevision = revision;
        project.workingRevision = null;
      } else {
        revision.status = ProjectRevisionStatus.Draft;
      }
      const event = Object.assign(new ProjectReviewEventEntity(), {
        project,
        revision,
        action,
        actor_id: BigInt(actorId),
        comment: comment ?? null,
      });
      project.reviewEvents.add(event);
      await em.flush();
      return this.projects.getEditor(id, actorId, true, em as EntityManager);
    });
  }
}
