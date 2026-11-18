import { describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';

import { GuildEvents } from '#config/guilds';
import type { GuildSettingsService } from '../settings/guild-settings.service';
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

/** `null` means the guild has no active role; otherwise member ids. */
function makeService(
  events: GuildEventEntity[],
  activeRoleMembers: string[] | null = null,
) {
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
  const guildSettings = {
    getActiveRole: mock(() =>
      Promise.resolve(
        activeRoleMembers === null
          ? null
          : { members: new Map(activeRoleMembers.map((id) => [id, {}])) },
      ),
    ),
  } as unknown as GuildSettingsService;

  return {
    service: new GuildEventService(repository, entityManager, guildSettings),
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

    it('resolves ${active} from the guild active role', async () => {
      const entity = makeEntity({ message: 'Активный: ${active}' });
      const { service } = makeService([entity], ['111', '222']);

      const message = await service.getRandom(GuildEvents.MEMBER_JOIN, {
        guildId: 'guild',
      });

      expect(message).toMatch(/^Активный: <@(111|222)>$/);
    });

    it('resolves ${active} in every guild render independently', async () => {
      const entity = makeEntity({ message: 'Активный: ${active}' });
      const { service } = makeService([entity], ['111']);

      const message = await service.getRandom(GuildEvents.MEMBER_JOIN, {
        guildId: 'guild',
      });
      const nextMessage = await service.getRandom(GuildEvents.MEMBER_JOIN, {
        guildId: 'guild',
      });

      expect(message).toBe('Активный: <@111>');
      expect(nextMessage).toBe('Активный: <@111>');
    });

    it('leaves ${active} unresolved when the guild has no active role', async () => {
      const entity = makeEntity({ message: 'Активный: ${active}' });
      const { service } = makeService([entity], null);

      const message = await service.getRandom(GuildEvents.MEMBER_JOIN, {
        guildId: 'guild',
      });

      expect(message).toBe('Активный: ${active}');
    });

    it('leaves ${active} unresolved when no guildId is passed', async () => {
      const entity = makeEntity({ message: 'Активный: ${active}' });
      const { service } = makeService([entity], ['111']);

      const message = await service.getRandom(GuildEvents.MEMBER_JOIN);

      expect(message).toBe('Активный: ${active}');
    });

    it('does not leak the guildId param into the template', async () => {
      const entity = makeEntity({ message: 'g ${guildId}' });
      const { service } = makeService([entity], ['111']);

      const message = await service.getRandom(GuildEvents.MEMBER_JOIN, {
        guildId: 'guild',
      });

      expect(message).toBe('g ${guildId}');
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

  describe('listEvents', () => {
    it('returns the pick probability within each event pool', async () => {
      const fresh = makeEntity({
        id: 'fresh',
        event: GuildEvents.MEMBER_JOIN,
        triggered_count: 0,
      });
      const worn = makeEntity({
        id: 'worn',
        event: GuildEvents.MEMBER_JOIN,
        triggered_count: 10,
      });
      const solo = makeEntity({
        id: 'solo',
        event: GuildEvents.MEMBER_LEAVE,
        triggered_count: 3,
      });
      const { service } = makeService([fresh, worn, solo]);

      const views = await service.listEvents();

      const sum = 1 / (0 + 10) + 1 / (10 + 10);
      expect(views.map((v) => v.probability)).toEqual([
        1 / 10 / sum,
        1 / 20 / sum,
        1,
      ]);
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

    it('renders ${irandom,min,max} within the inclusive range', () => {
      const entity = makeEntity({ message: 'кубик: ${irandom,1,6}' });
      for (let i = 0; i < 100; i++) {
        expect(GuildEventService.buildTemplate(entity, {})).toMatch(
          /^кубик: [1-6]$/,
        );
      }
    });

    it('renders ${irandom,min,max} with negative bounds', () => {
      const entity = makeEntity({ message: '${irandom,-5,-1}' });
      for (let i = 0; i < 100; i++) {
        expect(GuildEventService.buildTemplate(entity, {})).toMatch(
          /^-(?:[1-5])$/,
        );
      }
    });

    it('renders ${irandom,5,5} as the single value', () => {
      const entity = makeEntity({ message: '${irandom,5,5}' });
      expect(GuildEventService.buildTemplate(entity, {})).toBe('5');
    });

    it('renders ${choose,...} with one of the arguments', () => {
      const entity = makeEntity({ message: '${choose,привет,пока}' });
      const seen = new Set<string>();
      for (let i = 0; i < 100; i++) {
        seen.add(GuildEventService.buildTemplate(entity, {}));
      }
      expect([...seen].sort()).toEqual(['пока', 'привет']);
    });

    it('renders ${choose,...} with multi-word arguments', () => {
      const entity = makeEntity({
        message: '${choose,мало денег,много денег}',
      });
      expect(GuildEventService.buildTemplate(entity, {})).toMatch(
        /^(мало|много) денег$/,
      );
    });

    it('trims spaces around ${choose,...} argument separators', () => {
      const entity = makeEntity({ message: '${choose, a , b }' });
      expect(GuildEventService.buildTemplate(entity, {})).toMatch(/^[ab]$/);
    });

    it('replaces ${active} from params like a plain parameter', () => {
      const entity = makeEntity({ message: 'жертва: ${active}' });
      expect(GuildEventService.buildTemplate(entity, { active: '<@42>' })).toBe(
        'жертва: <@42>',
      );
    });

    it('leaves invalid dynamic tokens untouched', () => {
      const entity = makeEntity({
        message:
          '${irandom,1} ${irandom,a,b} ${irandom,5,1} ${choose} ${foo,bar}',
      });
      expect(GuildEventService.buildTemplate(entity, {})).toBe(
        '${irandom,1} ${irandom,a,b} ${irandom,5,1} ${choose} ${foo,bar}',
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
      const problems = GuildEventService.validateTemplate(
        'No placeholders',
        requiredParams,
      );
      expect(problems).toEqual([
        'missing parameter name',
        'missing parameter role',
      ]);
    });

    it('returns only the missing params', () => {
      const requiredParams = ['name', 'role'];
      const problems = GuildEventService.validateTemplate(
        'Hi ${name}',
        requiredParams,
      );
      expect(problems).toEqual(['missing parameter role']);
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

    it('accepts dynamic tokens alongside required params', () => {
      expect(
        GuildEventService.validateTemplate(
          'Выпал ${irandom,1,10}: ${choose,орёл,решка} для ${user} и ${active}',
          ['user'],
        ),
      ).toEqual([]);
    });

    it('rejects ${irandom} with wrong argument count', () => {
      expect(GuildEventService.validateTemplate('${irandom,1}', [])).toEqual([
        '${irandom} expects exactly 2 argument(s)',
      ]);
    });

    it('rejects ${irandom} with non-integer arguments', () => {
      expect(GuildEventService.validateTemplate('${irandom,a,b}', [])).toEqual([
        '${irandom} expects two integers',
      ]);
    });

    it('rejects ${irandom} with min greater than max', () => {
      expect(GuildEventService.validateTemplate('${irandom,5,1}', [])).toEqual([
        '${irandom} expects min <= max',
      ]);
    });

    it('rejects bare ${choose} without arguments', () => {
      expect(GuildEventService.validateTemplate('${choose}', [])).toEqual([
        '${choose} expects at least 1 argument(s)',
      ]);
    });

    it('rejects ${active} with arguments', () => {
      expect(GuildEventService.validateTemplate('${active,1}', [])).toEqual([
        '${active} expects exactly 0 argument(s)',
      ]);
    });

    it('rejects unknown tokens with arguments', () => {
      expect(GuildEventService.validateTemplate('${foo,bar}', [])).toEqual([
        'unknown token ${foo}',
      ]);
    });

    it('rejects malformed placeholders', () => {
      expect(
        GuildEventService.validateTemplate('${} ${a,,b} ${a b}', []),
      ).toEqual([
        'malformed placeholder ${}',
        'malformed placeholder ${a,,b}',
        'malformed placeholder ${a b}',
      ]);
    });
  });
});
