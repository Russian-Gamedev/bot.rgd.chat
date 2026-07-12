import type { EntityManager as CoreEntityManager } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { CreateGameTagDto, UpdateGameTagDto } from './dto/games.dto';
import { GameRevisionTagEntity, GameTagEntity } from './entities/games.entity';

@Injectable()
export class GameTagsService {
  constructor(
    private readonly em: EntityManager,
    @InjectRepository(GameTagEntity)
    private readonly tags: EntityRepository<GameTagEntity>,
    @InjectRepository(GameRevisionTagEntity)
    private readonly revisionTags: EntityRepository<GameRevisionTagEntity>,
  ) {}

  async list() {
    return this.tags.findAll({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateGameTagDto) {
    return (await this.ensure([dto.name], this.em))[0];
  }

  async update(id: string, dto: UpdateGameTagDto) {
    const tag = await this.tags.findOne(id);
    if (!tag) throw new NotFoundException('Tag not found.');
    if (dto.name !== undefined) {
      tag.name = normalizeTagName(dto.name);
      tag.slug = createTagSlug(tag.name);
    }
    await this.em.flush();
    return tag;
  }

  async remove(id: string) {
    const tag = await this.tags.findOne(id);
    if (!tag) throw new NotFoundException('Tag not found.');
    if (await this.revisionTags.count({ tag })) {
      throw new ConflictException('Tag is used by a game.');
    }
    this.em.remove(tag);
    await this.em.flush();
  }

  async ensure(
    names: string[],
    em: CoreEntityManager,
  ): Promise<GameTagEntity[]> {
    const values = [
      ...new Map(
        names.map((value) => {
          const name = normalizeTagName(value);
          return [createTagSlug(name), name];
        }),
      ),
    ].map(([slug, name]) => ({ slug, name }));
    if (values.length === 0) return [];

    await em.upsertMany(GameTagEntity, values, {
      onConflictFields: ['slug'],
      onConflictAction: 'ignore',
    });
    const stored = await em.find(GameTagEntity, {
      slug: { $in: values.map(({ slug }) => slug) },
    });
    const bySlug = new Map(stored.map((tag) => [tag.slug, tag]));
    return values.map(({ slug }) => bySlug.get(slug) as GameTagEntity);
  }
}

function normalizeTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function createTagSlug(name: string): string {
  const normalized = name.normalize('NFKC').toLocaleLowerCase('ru-RU');
  const base = normalized
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
  const canonical = normalized.replace(/\s+/g, '-');
  if (base && base === canonical) return base.slice(0, 64);
  const hash = tagHash(normalized);
  return `${base.slice(0, 54) || 'tag'}-${hash}`;
}

function tagHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) as number;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
