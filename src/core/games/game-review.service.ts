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

import type { GameReviewListQueryDto } from './dto/games.dto';
import {
  GameEntity,
  GameReviewEventEntity,
  GameRevisionEntity,
} from './entities/games.entity';
import { GamesService } from './games.service';
import { GameReviewAction, GameRevisionStatus } from './games.types';

@Injectable()
export class GameReviewService {
  private readonly logger = new Logger(GameReviewService.name);

  constructor(
    private readonly em: PostgreSqlEntityManager,
    @InjectRepository(GameEntity)
    private readonly gamesRepository: EntityRepository<GameEntity>,
    private readonly games: GamesService,
  ) {}

  async list(query: GameReviewListQueryDto) {
    const revision: FilterQuery<GameRevisionEntity> = {};
    if (query.status) revision.status = query.status;
    if (query.search) revision.title = { $ilike: `%${query.search}%` };
    const where: FilterQuery<GameEntity> = query.owner_id
      ? { owner_id: BigInt(query.owner_id) }
      : {};
    if (query.status === GameRevisionStatus.Published) {
      where.workingRevision = null;
      where.publishedRevision = revision;
    } else if (query.status || query.search) {
      where.workingRevision = revision;
    }
    const [games, total] = await this.gamesRepository.findAndCount(where, {
      populate: ['workingRevision', 'publishedRevision'],
      orderBy: { updatedAt: 'desc' },
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: games.map((game) => {
        const current = game.workingRevision ?? game.publishedRevision;
        return {
          id: game.id,
          slug: game.slug,
          owner_id: game.owner_id.toString(),
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
    return this.transition(id, actorId, GameReviewAction.Published, comment);
  }

  requestChanges(id: string, actorId: string, comment: string) {
    return this.transition(
      id,
      actorId,
      GameReviewAction.ChangesRequested,
      comment,
    );
  }

  async transferOwner(id: string, ownerId: string) {
    return this.em.transactional(async (em) => {
      const game = await em.findOne(GameEntity, id, {
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!game) throw new NotFoundException('Game not found.');
      game.owner_id = BigInt(ownerId);
      await em.flush();
      this.logger.log(
        `Game ${id} owner transferred to Discord user ${ownerId}`,
      );
      return this.games.getEditor(id, ownerId, true, em);
    });
  }

  private transition(
    id: string,
    actorId: string,
    action: GameReviewAction.Published | GameReviewAction.ChangesRequested,
    comment?: string,
  ) {
    return this.em.transactional(async (em) => {
      const game = await em.findOne(GameEntity, id, {
        populate: ['workingRevision', 'reviewEvents'],
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!game) throw new NotFoundException('Game not found.');
      const revision = game.workingRevision;
      if (!revision || revision.status !== GameRevisionStatus.Review) {
        throw new ConflictException(
          'Only a revision under review can be processed.',
        );
      }
      if (action === GameReviewAction.Published) {
        revision.status = GameRevisionStatus.Published;
        revision.published_at = new Date();
        game.publishedRevision = revision;
        game.workingRevision = null;
      } else {
        revision.status = GameRevisionStatus.Draft;
      }
      const event = Object.assign(new GameReviewEventEntity(), {
        game,
        revision,
        action,
        actor_id: BigInt(actorId),
        comment: comment ?? null,
      });
      game.reviewEvents.add(event);
      await em.flush();
      return this.games.getEditor(id, actorId, true, em as EntityManager);
    });
  }
}
