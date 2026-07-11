import {
  type EntityManager,
  type FilterQuery,
  type Loaded,
  LockMode,
  raw,
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
  CreateGameDto,
  GameListQueryDto,
  MineGamesQueryDto,
  UpdateGameDto,
} from './dto/games.dto';
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
import {
  GameAuthorType,
  GameListSort,
  GameReviewAction,
  GameRevisionStatus,
} from './games.types';

const GAME_POPULATE = [
  'publishedRevision.authors',
  'publishedRevision.genreLinks.genre',
  'publishedRevision.links',
  'publishedRevision.attachments',
  'workingRevision.authors',
  'workingRevision.genreLinks.genre',
  'workingRevision.links',
  'workingRevision.attachments',
] as const;
const EDITOR_POPULATE = [...GAME_POPULATE, 'reviewEvents.revision'] as const;

type PopulatedRevision = Loaded<
  GameRevisionEntity,
  'authors' | 'genreLinks.genre' | 'links' | 'attachments'
>;

@Injectable()
export class GamesService {
  constructor(
    private readonly em: PostgreSqlEntityManager,
    @InjectRepository(GameEntity)
    private readonly games: EntityRepository<GameEntity>,
    @InjectRepository(GameLikeEntity)
    private readonly likes: EntityRepository<GameLikeEntity>,
  ) {}

  async list(query: GameListQueryDto) {
    const revisionWhere: FilterQuery<GameRevisionEntity> = {};
    if (query.genre)
      revisionWhere.genreLinks = { genre: { slug: query.genre } };
    if (query.author_id) {
      revisionWhere.authors = { discord_user_id: BigInt(query.author_id) };
    }
    if (query.search) revisionWhere.title = { $ilike: `%${query.search}%` };
    if (query.release_from || query.release_to) {
      revisionWhere.release_date = {
        ...(query.release_from ? { $gte: query.release_from } : {}),
        ...(query.release_to ? { $lte: query.release_to } : {}),
      };
    }
    const [games, total] = await this.games.findAndCount(
      { publishedRevision: { $ne: null, ...revisionWhere } },
      {
        populate: GAME_POPULATE,
        limit: query.limit,
        offset: query.offset,
        orderBy: this.publicOrder(query.sort),
      },
    );
    const counts = await this.likeCounts(games);
    return {
      items: games.map((game) =>
        this.listItem(
          game,
          game.publishedRevision as PopulatedRevision,
          counts,
        ),
      ),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getPublic(id: string) {
    const game = await this.games.findOne(
      { id, publishedRevision: { $ne: null } },
      { populate: GAME_POPULATE },
    );
    if (!game?.publishedRevision)
      throw new NotFoundException('Game not found.');
    return this.details(
      game,
      game.publishedRevision as PopulatedRevision,
      await this.likes.count({ game }),
    );
  }

  async create(ownerId: string, dto: CreateGameDto) {
    return this.em.transactional(async (em) => {
      const game = Object.assign(new GameEntity(), {
        owner_id: BigInt(ownerId),
      });
      const revision = Object.assign(new GameRevisionEntity(), {
        game,
        version: 1,
        status: GameRevisionStatus.Draft,
        title: dto.title,
        description: dto.description,
        release_date: dto.release_date,
        created_by: BigInt(ownerId),
      });
      game.revisions.add(revision);
      game.workingRevision = revision;
      await this.applyChildren(em, revision, dto);
      em.persist(game);
      await em.flush();
      return this.editorDto(game, revision as PopulatedRevision, [], 0);
    });
  }

  async listMine(ownerId: string, query: MineGamesQueryDto) {
    const where: FilterQuery<GameEntity> = { owner_id: BigInt(ownerId) };
    if (query.status) {
      where.$or = [
        { workingRevision: { status: query.status } },
        {
          workingRevision: null,
          publishedRevision: { status: query.status },
        },
      ];
    }
    const [games, total] = await this.games.findAndCount(where, {
      populate: GAME_POPULATE,
      orderBy: { updatedAt: 'desc' },
      limit: query.limit,
      offset: query.offset,
    });
    return {
      items: games.map((game) => {
        const revision = game.workingRevision ?? game.publishedRevision;
        return {
          id: game.id,
          owner_id: game.owner_id.toString(),
          revision_id: revision?.id,
          title: revision?.title,
          status: revision?.status,
          version: revision?.version,
          has_published_version: Boolean(game.publishedRevision),
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
    const game = await manager.findOne(GameEntity, id, {
      populate: EDITOR_POPULATE,
    });
    if (!game) throw new NotFoundException('Game not found.');
    this.assertOwner(game, actorId, reviewer);
    const revision = game.workingRevision ?? game.publishedRevision;
    if (!revision) throw new NotFoundException('Game revision not found.');
    const events = game.reviewEvents
      .getItems()
      .sort(
        (left, right) => left.created_at.getTime() - right.created_at.getTime(),
      );
    return this.editorDto(
      game,
      revision as PopulatedRevision,
      events,
      await manager.count(GameLikeEntity, { game }),
    );
  }

  async update(id: string, ownerId: string, dto: UpdateGameDto) {
    return this.em.transactional(async (em) => {
      const game = await em.findOne(GameEntity, id, {
        populate: EDITOR_POPULATE,
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!game) throw new NotFoundException('Game not found.');
      this.assertOwner(game, ownerId, false);
      let revision = game.workingRevision as PopulatedRevision | null;
      if (!revision) {
        if (!game.publishedRevision) {
          throw new ConflictException('Game has no revision to edit.');
        }
        const published = game.publishedRevision as PopulatedRevision;
        revision = Object.assign(new GameRevisionEntity(), {
          game,
          version: published.version + 1,
          status: GameRevisionStatus.Draft,
          title: published.title,
          description: published.description,
          release_date: published.release_date,
          created_by: BigInt(ownerId),
        }) as unknown as PopulatedRevision;
        game.revisions.add(revision);
        game.workingRevision = revision;
        await this.cloneChildren(published, revision);
      }
      if (revision.status === GameRevisionStatus.Review) {
        throw new ConflictException('Game is currently under review.');
      }
      if (dto.title !== undefined) revision.title = dto.title;
      if (dto.description !== undefined) revision.description = dto.description;
      if (dto.release_date !== undefined)
        revision.release_date = dto.release_date;
      await this.applyChildren(em, revision, dto, true);
      await em.flush();
      return this.getEditor(id, ownerId, false, em);
    });
  }

  async submit(id: string, ownerId: string) {
    return this.em.transactional(async (em) => {
      const game = await em.findOne(GameEntity, id, {
        populate: EDITOR_POPULATE,
        lockMode: LockMode.PESSIMISTIC_WRITE,
      });
      if (!game) throw new NotFoundException('Game not found.');
      this.assertOwner(game, ownerId, false);
      const revision = game.workingRevision as PopulatedRevision | null;
      if (!revision || revision.status !== GameRevisionStatus.Draft) {
        throw new ConflictException('Only a draft can be submitted.');
      }
      if (revision.authors.length === 0 || revision.genreLinks.length === 0) {
        throw new ConflictException(
          'A game must have at least one author and one genre before review.',
        );
      }
      revision.status = GameRevisionStatus.Review;
      revision.submitted_at = new Date();
      const event = Object.assign(new GameReviewEventEntity(), {
        game,
        revision,
        action: GameReviewAction.Submitted,
        actor_id: BigInt(ownerId),
      });
      game.reviewEvents.add(event);
      await em.flush();
      return this.getEditor(id, ownerId, false, em);
    });
  }

  async remove(id: string, actorId: string, reviewer: boolean) {
    const game = await this.games.findOne(id, {
      populate: ['publishedRevision'],
    });
    if (!game) throw new NotFoundException('Game not found.');
    if (game.publishedRevision && !reviewer) {
      throw new ForbiddenException(
        'Published games can only be deleted by reviewers.',
      );
    }
    this.assertOwner(game, actorId, reviewer);
    this.em.remove(game);
    await this.em.flush();
  }

  private publicOrder(sort: GameListSort) {
    if (sort === GameListSort.ReleaseDateAsc) {
      return { publishedRevision: { release_date: 'asc' as const } };
    }
    if (sort === GameListSort.ReleaseDateDesc) {
      return { publishedRevision: { release_date: 'desc' as const } };
    }
    return { publishedRevision: { published_at: 'desc' as const } };
  }

  private async likeCounts(games: GameEntity[]) {
    const counts = new Map<string, number>();
    if (!games.length) return counts;
    const rows = await this.likes
      .createQueryBuilder('like')
      .select(['like.game', raw('count(*) as count')])
      .where({ game: { $in: games } })
      .groupBy('like.game')
      .execute<{ game: string; count: string }[]>();
    for (const row of rows) counts.set(row.game, Number(row.count));
    return counts;
  }

  private listItem(
    game: GameEntity,
    revision: PopulatedRevision,
    counts: Map<string, number>,
  ) {
    return {
      id: game.id,
      title: revision.title,
      release_date: String(revision.release_date).slice(0, 10),
      genres: revision.genreLinks.getItems().map(({ genre }) => ({
        id: genre.id,
        slug: genre.slug,
        name: genre.name,
      })),
      authors: this.authorDtos(revision),
      image:
        revision.attachments
          .getItems()
          .sort((a, b) => a.position - b.position)
          .find((attachment) => attachment.type === 'image')?.url ?? null,
      likes_count: counts.get(game.id) ?? 0,
      published_at: revision.published_at,
    };
  }

  private details(
    game: GameEntity,
    revision: PopulatedRevision,
    likes: number,
  ) {
    return {
      ...this.listItem(game, revision, new Map([[game.id, likes]])),
      description: revision.description,
      owner_id: game.owner_id.toString(),
      links: revision.links
        .getItems()
        .sort((a, b) => a.position - b.position)
        .map(({ icon, label, link }) => ({ icon, label, link })),
      attachments: revision.attachments
        .getItems()
        .sort((a, b) => a.position - b.position)
        .map(({ type, url }) => ({ type, url })),
      updated_at: revision.updatedAt,
    };
  }

  private editorDto(
    game: GameEntity,
    revision: PopulatedRevision,
    events: GameReviewEventEntity[],
    likes: number,
  ) {
    return {
      ...this.details(game, revision, likes),
      status: revision.status,
      version: revision.version,
      has_published_version: Boolean(game.publishedRevision),
      published_version: game.publishedRevision?.version ?? null,
      review_events: events.map((event) => ({
        id: event.id,
        revision_id: event.revision.id,
        action: event.action,
        actor_id: event.actor_id.toString(),
        comment: event.comment,
        created_at: event.created_at,
      })),
    };
  }

  private authorDtos(revision: PopulatedRevision) {
    return revision.authors
      .getItems()
      .sort((a, b) => a.position - b.position)
      .map((author) =>
        author.type === GameAuthorType.Discord
          ? {
              type: author.type,
              discord_user_id: author.discord_user_id?.toString(),
            }
          : { type: author.type, name: author.name },
      );
  }

  private async applyChildren(
    em: EntityManager,
    revision: GameRevisionEntity,
    dto: UpdateGameDto,
    partial = false,
  ) {
    if (!partial || dto.genre_ids !== undefined) {
      const ids = dto.genre_ids ?? [];
      const genres = ids.length
        ? await em.find(GameGenreEntity, { id: { $in: ids } })
        : [];
      if (genres.length !== new Set(ids).size) {
        throw new BadRequestException('One or more genres do not exist.');
      }
      revision.genreLinks.set(
        genres.map((genre) =>
          Object.assign(new GameRevisionGenreEntity(), { revision, genre }),
        ),
      );
    }
    if (!partial || dto.authors !== undefined) {
      revision.authors.set(
        (dto.authors ?? []).map((author, position) =>
          Object.assign(new GameAuthorEntity(), {
            revision,
            type: author.type,
            discord_user_id: author.discord_user_id
              ? BigInt(author.discord_user_id)
              : null,
            name: author.name ?? null,
            position,
          }),
        ),
      );
    }
    if (!partial || dto.links !== undefined) {
      revision.links.set(
        (dto.links ?? []).map((link, position) =>
          Object.assign(new GameLinkEntity(), { revision, ...link, position }),
        ),
      );
    }
    if (!partial || dto.attachments !== undefined) {
      revision.attachments.set(
        (dto.attachments ?? []).map((attachment, position) =>
          Object.assign(new GameAttachmentEntity(), {
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
    target: GameRevisionEntity,
  ) {
    target.genreLinks.set(
      source.genreLinks.getItems().map(({ genre }) =>
        Object.assign(new GameRevisionGenreEntity(), {
          revision: target,
          genre,
        }),
      ),
    );
    target.authors.set(
      source.authors.getItems().map((author) =>
        Object.assign(new GameAuthorEntity(), {
          revision: target,
          type: author.type,
          discord_user_id: author.discord_user_id,
          name: author.name,
          position: author.position,
        }),
      ),
    );
    target.links.set(
      source.links.getItems().map((link) =>
        Object.assign(new GameLinkEntity(), {
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
        Object.assign(new GameAttachmentEntity(), {
          revision: target,
          type: attachment.type,
          url: attachment.url,
          position: attachment.position,
        }),
      ),
    );
  }

  private assertOwner(game: GameEntity, actorId: string, reviewer: boolean) {
    if (!reviewer && game.owner_id.toString() !== actorId) {
      throw new ForbiddenException('Only the owner can access this game.');
    }
  }
}
