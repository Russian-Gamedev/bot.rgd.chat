import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { CreateGameGenreDto, UpdateGameGenreDto } from './dto/games.dto';
import {
  GameGenreEntity,
  GameRevisionGenreEntity,
} from './entities/games.entity';

@Injectable()
export class GameGenresService {
  constructor(
    private readonly em: EntityManager,
    @InjectRepository(GameGenreEntity)
    private readonly genres: EntityRepository<GameGenreEntity>,
    @InjectRepository(GameRevisionGenreEntity)
    private readonly revisionGenres: EntityRepository<GameRevisionGenreEntity>,
  ) {}

  async list() {
    return this.genres.findAll({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateGameGenreDto) {
    const genre = Object.assign(new GameGenreEntity(), dto);
    this.em.persist(genre);
    await this.em.flush();
    return genre;
  }

  async update(id: string, dto: UpdateGameGenreDto) {
    const genre = await this.genres.findOne(id);
    if (!genre) throw new NotFoundException('Genre not found.');
    this.genres.assign(genre, dto);
    await this.em.flush();
    return genre;
  }

  async remove(id: string) {
    const genre = await this.genres.findOne(id);
    if (!genre) throw new NotFoundException('Genre not found.');
    if (await this.revisionGenres.count({ genre })) {
      throw new ConflictException('Genre is used by a game.');
    }
    this.em.remove(genre);
    await this.em.flush();
  }
}
