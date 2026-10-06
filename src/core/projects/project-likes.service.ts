import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';

import { ProjectEntity, ProjectLikeEntity } from './entities/projects.entity';

@Injectable()
export class ProjectLikesService {
  constructor(
    private readonly em: EntityManager,
    @InjectRepository(ProjectEntity)
    private readonly projects: EntityRepository<ProjectEntity>,
    @InjectRepository(ProjectLikeEntity)
    private readonly likes: EntityRepository<ProjectLikeEntity>,
  ) {}

  async get(id: string, userId: string) {
    const project = await this.getPublished(id);
    const where = { project, user_id: BigInt(userId) };
    const [liked, likes_count] = await Promise.all([
      this.likes.count(where),
      this.likes.count({ project }),
    ]);
    return { liked: liked > 0, likes_count };
  }

  async like(id: string, userId: string) {
    const project = await this.getPublished(id);
    const user_id = BigInt(userId);
    await this.em.upsert(ProjectLikeEntity, {
      project,
      user_id,
      created_at: new Date(),
    });
    return this.get(id, userId);
  }

  async unlike(id: string, userId: string) {
    const project = await this.getPublished(id);
    await this.likes.nativeDelete({ project, user_id: BigInt(userId) });
    return this.get(id, userId);
  }

  private async getPublished(id: string) {
    const project = await this.projects.findOne({
      id,
      publishedRevision: { $ne: null },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }
}
