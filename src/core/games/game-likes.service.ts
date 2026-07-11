import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException } from '@nestjs/common';

import { GameEntity, GameLikeEntity } from './entities/games.entity';

@Injectable()
export class GameLikesService {
  constructor(
    private readonly em: EntityManager,
    @InjectRepository(GameEntity)
    private readonly games: EntityRepository<GameEntity>,
    @InjectRepository(GameLikeEntity)
    private readonly likes: EntityRepository<GameLikeEntity>,
  ) {}

  async get(id: string, userId: string) {
    const game = await this.getPublished(id);
    const where = { game, user_id: BigInt(userId) };
    const [liked, likes_count] = await Promise.all([
      this.likes.count(where),
      this.likes.count({ game }),
    ]);
    return { liked: liked > 0, likes_count };
  }

  async like(id: string, userId: string) {
    const game = await this.getPublished(id);
    const user_id = BigInt(userId);
    await this.em.upsert(GameLikeEntity, {
      game,
      user_id,
      created_at: new Date(),
    });
    return this.get(id, userId);
  }

  async unlike(id: string, userId: string) {
    const game = await this.getPublished(id);
    await this.likes.nativeDelete({ game, user_id: BigInt(userId) });
    return this.get(id, userId);
  }

  private async getPublished(id: string) {
    const game = await this.games.findOne({
      id,
      publishedRevision: { $ne: null },
    });
    if (!game) throw new NotFoundException('Game not found.');
    return game;
  }
}
