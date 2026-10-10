import { describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

import { GuildEvents } from '#config/guilds';

import { GuildEventEntity } from './entities/events.entity';
import { GuildEventService } from './guild-events.service';

function makeEntity(
  overrides: Partial<GuildEventEntity> = {},
): GuildEventEntity {
  const event = new GuildEventEntity();
  event.id = 'test-id';
  event.message = '';
  event.attachments = null;
  event.triggered_count = 0;
  return Object.assign(event, overrides);
}

function makeService(events: GuildEventEntity[]) {
  const flushed: GuildEventEntity[] = [];
  const repository = {
    find: mock(() => Promise.resolve(events)),
  } as unknown as EntityRepository<GuildEventEntity>;
  const entityManager = {
    persist: mock((entity: GuildEventEntity) => ({
      flush: mock(async () => {
        flushed.push(entity);
      }),
    })),
  } as unknown as EntityManager;

  return {
    service: new GuildEventService(repository, entityManager),
    flushed,
  };
}

describe('Template', () => {
  describe('getRandom', () => {
    it('returns null when there are no templates', async () => {
      const { service } = makeService([]);
      expect(await service.getRandom(GuildEvents.MEMBER_FIRST_JOIN)).toBeNull();
    });

    it('increments the picked template and persists it', async () => {
      const entity = makeEntity({
        message: 'Hello ${name}',
        triggered_count: 5,
      });
      const { service, flushed } = makeService([entity]);

      const message = await service.getRandom(GuildEvents.MEMBER_FIRST_JOIN, {
        name: 'World',
      });

      expect(message).toBe('Hello World');
      expect(entity.triggered_count).toBe(6);
      expect(flushed).toEqual([entity]);
    });

    it('strongly prefers the least-picked template', async () => {
      const fresh = makeEntity({ id: 'fresh', message: 'fresh' });
      const worn = makeEntity({
        id: 'worn',
        message: 'worn',
        triggered_count: 1000,
      });
      const { service } = makeService([fresh, worn]);

      let freshPicks = 0;
      for (let i = 0; i < 200; i++) {
        if (
          (await service.getRandom(GuildEvents.MEMBER_FIRST_JOIN)) === 'fresh'
        ) {
          freshPicks++;
        }
        fresh.triggered_count = 0;
        worn.triggered_count = 1000;
      }
      expect(freshPicks).toBeGreaterThan(180);
    });
  });

  describe('buildTemplate', () => {
    it('replaces known ${param} placeholders', () => {
      const entity = makeEntity({
        message: 'Hello, ${name}!',
        attachments: null,
      });
      const params = { name: 'World' };
      expect(GuildEventService.buildTemplate(entity, params)).toBe(
        'Hello, World!',
      );
    });

    it('replaces multiple different placeholders', () => {
      const entity = makeEntity({
        message: '${a} + ${b} = ${c}',
        attachments: null,
      });
      const params = { a: '1', b: '2', c: '3' };
      expect(GuildEventService.buildTemplate(entity, params)).toBe('1 + 2 = 3');
    });

    it('leaves unknown placeholders untouched', () => {
      const entity = makeEntity({
        message: 'Hi ${name}, your role is ${role}',
        attachments: null,
      });
      const params = { name: 'Alice' };
      expect(GuildEventService.buildTemplate(entity, params)).toBe(
        'Hi Alice, your role is ${role}',
      );
    });

    it('returns message unchanged when params is empty', () => {
      const entity = makeEntity({
        message: 'No params here',
        attachments: null,
      });
      const params = {};
      expect(GuildEventService.buildTemplate(entity, params)).toBe(
        'No params here',
      );
    });

    it('appends the single attachment on a new line', () => {
      const entity = makeEntity({
        message: 'msg',
        attachments: ['https://example.com/img.png'],
      });
      const params = {};
      expect(GuildEventService.buildTemplate(entity, params)).toBe(
        'msg\nhttps://example.com/img.png',
      );
    });

    it('does not append anything when attachments is null', () => {
      const entity = makeEntity({ message: 'msg', attachments: null });
      const params = {};
      expect(GuildEventService.buildTemplate(entity, params)).toBe('msg');
    });

    it('does not append anything when attachments is empty array', () => {
      const entity = makeEntity({ message: 'msg', attachments: [] });
      const params = {};
      expect(GuildEventService.buildTemplate(entity, params)).toBe('msg');
    });
  });

  describe('validateTemplate', () => {
    it('returns empty array when all required params are present', () => {
      const requiredParams = ['name'];
      expect(
        GuildEventService.validateTemplate('Hello ${name}', requiredParams),
      ).toEqual([]);
    });

    it('returns missing params when none are present in template', () => {
      const requiredParams = ['name', 'role'];
      const missing = GuildEventService.validateTemplate(
        'No placeholders',
        requiredParams,
      );
      expect(missing).toEqual(['name', 'role']);
    });

    it('returns only the missing params', () => {
      const requiredParams = ['name', 'role'];
      const missing = GuildEventService.validateTemplate(
        'Hi ${name}',
        requiredParams,
      );
      expect(missing).toEqual(['role']);
    });

    it('returns empty array for empty requiredParams', () => {
      const requiredParams = [];
      expect(
        GuildEventService.validateTemplate('anything', requiredParams),
      ).toEqual([]);
    });

    it('handles multiple occurrences of the same placeholder', () => {
      const requiredParams = ['name'];
      expect(
        GuildEventService.validateTemplate(
          '${name} and ${name}',
          requiredParams,
        ),
      ).toEqual([]);
    });
  });
});
