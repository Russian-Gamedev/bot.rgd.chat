import type { EntityManager as CoreEntityManager } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

import { ProjectTagEntity } from './entities/projects.entity';

@Injectable()
export class ProjectTagsService {
  constructor(
    @InjectRepository(ProjectTagEntity)
    private readonly tags: EntityRepository<ProjectTagEntity>,
  ) {}

  async list() {
    const tags = await this.tags.findAll({ orderBy: { name: 'asc' } });
    return tags.map(tagDto);
  }

  async ensure(
    names: string[],
    em: CoreEntityManager,
  ): Promise<ProjectTagEntity[]> {
    const values = [
      ...new Map(
        names.map((value) => {
          const name = normalizeTagName(value);
          return [createTagSlug(name), name];
        }),
      ),
    ].map(([slug, name]) => ({ slug, name }));
    if (values.length === 0) return [];

    await em.upsertMany(ProjectTagEntity, values, {
      onConflictFields: ['slug'],
      onConflictAction: 'ignore',
    });
    const stored = await em.find(ProjectTagEntity, {
      slug: { $in: values.map(({ slug }) => slug) },
    });
    const bySlug = new Map(stored.map((tag) => [tag.slug, tag]));
    return values.map(({ slug }) => bySlug.get(slug) as ProjectTagEntity);
  }
}

function tagDto({ name, slug }: ProjectTagEntity) {
  return { name, slug };
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
