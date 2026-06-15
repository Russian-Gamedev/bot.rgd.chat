import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager, EntityRepository } from '@mikro-orm/postgresql';
import type Redis from 'ioredis';
import type { DiscordProfileSyncService } from '#core/users/discord-profile-sync.service';
import { UserProfileEntity } from '#core/users/entities/user-profile.entity';
import { PatronEntity } from './entities/patron.entity';
import { PatronHistoryEntity } from './entities/patron-history.entity';
import { PatronsService } from './patrons.service';

describe('PatronsService', () => {
  let service: PatronsService;
  let mockEm: EntityManager;
  let mockPatronsRepo: EntityRepository<PatronEntity>;
  let mockUsersRepo: EntityRepository<UserProfileEntity>;
  let innerEm: EntityManager;
  let redis: Redis;
  let discordProfileSync: DiscordProfileSyncService;

  beforeEach(() => {
    mockPatronsRepo = {
      findAll: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<PatronEntity>;
    mockUsersRepo = {
      find: mock(() => Promise.resolve([])),
    } as unknown as EntityRepository<UserProfileEntity>;

    innerEm = {
      findOne: mock(() => Promise.resolve(null)),
      persist: mock(() => innerEm),
      flush: mock(() => Promise.resolve()),
    } as unknown as EntityManager;

    mockEm = {
      transactional: mock(async (cb: (em: EntityManager) => Promise<unknown>) =>
        cb(innerEm),
      ),
    } as unknown as EntityManager;

    redis = {
      get: mock(() => Promise.resolve(null)),
      set: mock(() => Promise.resolve('OK')),
      del: mock(() => Promise.resolve(1)),
    } as unknown as Redis;
    discordProfileSync = {
      syncUsersById: mock(() => Promise.resolve()),
    } as unknown as DiscordProfileSyncService;

    service = new PatronsService(
      mockPatronsRepo,
      mockUsersRepo,
      mockEm,
      redis,
      discordProfileSync,
    );
  });

  it('returns patrons from Redis cache without touching database or Discord', async () => {
    const cached = [
      {
        user: {
          id: '111',
          username: 'cached',
          avatar_url: 'cached-avatar.png',
          banner: 'cached-banner.png',
        },
        value: 1500,
      },
    ];
    (redis.get as ReturnType<typeof mock>).mockResolvedValueOnce(
      JSON.stringify(cached),
    );

    await expect(service.getPatrons()).resolves.toEqual(cached);
    expect(mockPatronsRepo.findAll).not.toHaveBeenCalled();
    expect(discordProfileSync.syncUsersById).not.toHaveBeenCalled();
  });

  it('deletes corrupt Redis cache and rebuilds patrons response', async () => {
    (redis.get as ReturnType<typeof mock>).mockResolvedValueOnce('{broken');
    const patron = new PatronEntity();
    patron.user_id = 111n;
    patron.value = 1500;
    (mockPatronsRepo.findAll as ReturnType<typeof mock>).mockResolvedValueOnce([
      patron,
    ]);
    const user = new UserProfileEntity();
    user.user_id = 111n;
    user.username = 'fresh';
    user.avatar_url = 'fresh-avatar.png';
    user.banner = null;
    user.banner_alt = null;
    user.banner_color = '#111';
    (mockUsersRepo.find as ReturnType<typeof mock>).mockResolvedValueOnce([
      user,
    ]);

    await expect(service.getPatrons()).resolves.toEqual([
      {
        user: {
          id: '111',
          username: 'fresh',
          avatar_url: 'fresh-avatar.png',
          banner: '#111',
        },
        value: 1500,
      },
    ]);
    expect(redis.del).toHaveBeenCalledWith('patrons:list:v1');
  });

  it('returns patrons sorted by value with user data', async () => {
    const firstPatron = new PatronEntity();
    firstPatron.user_id = 111n;
    firstPatron.value = 1500;
    const secondPatron = new PatronEntity();
    secondPatron.user_id = 222n;
    secondPatron.value = 500;
    (mockPatronsRepo.findAll as ReturnType<typeof mock>).mockResolvedValueOnce([
      firstPatron,
      secondPatron,
    ]);
    const firstUser = new UserProfileEntity();
    firstUser.user_id = 111n;
    firstUser.username = 'first';
    firstUser.avatar_url = 'first-avatar.png';
    firstUser.banner = 'first-banner.png';
    firstUser.banner_alt = 'first banner';
    firstUser.banner_color = '#111';
    const secondUser = new UserProfileEntity();
    secondUser.user_id = 222n;
    secondUser.username = 'second';
    secondUser.avatar_url = 'second-avatar.png';
    secondUser.banner = 'second-banner.png';
    secondUser.banner_alt = null;
    secondUser.banner_color = '#222';
    (mockUsersRepo.find as ReturnType<typeof mock>).mockResolvedValueOnce([
      firstUser,
      secondUser,
    ]);

    await expect(service.getPatrons()).resolves.toEqual([
      {
        user: {
          id: '111',
          username: 'first',
          avatar_url: 'first-avatar.png',
          banner: 'first banner',
        },
        value: 1500,
      },
      {
        user: {
          id: '222',
          username: 'second',
          avatar_url: 'second-avatar.png',
          banner: 'second-banner.png',
        },
        value: 500,
      },
    ]);
    expect(mockPatronsRepo.findAll).toHaveBeenCalledWith({
      orderBy: { value: 'DESC' },
    });
    expect(discordProfileSync.syncUsersById).toHaveBeenCalledWith([111n, 222n]);
    expect(redis.set).toHaveBeenCalledWith(
      'patrons:list:v1',
      JSON.stringify([
        {
          user: {
            id: '111',
            username: 'first',
            avatar_url: 'first-avatar.png',
            banner: 'first banner',
          },
          value: 1500,
        },
        {
          user: {
            id: '222',
            username: 'second',
            avatar_url: 'second-avatar.png',
            banner: 'second-banner.png',
          },
          value: 500,
        },
      ]),
      'EX',
      3600,
    );
  });

  it('creates patron and history on first value add', async () => {
    const patron = await service.addPatronValue('123', 100);

    expect(patron).toBeInstanceOf(PatronEntity);
    expect(patron.user_id).toBe(123n);
    expect(patron.value).toBe(100);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(innerEm.persist).toHaveBeenCalledTimes(2);
    const persisted = (innerEm.persist as ReturnType<typeof mock>).mock.calls;
    expect(persisted[0]?.[0]).toBeInstanceOf(PatronEntity);
    expect(persisted[1]?.[0]).toBeInstanceOf(PatronHistoryEntity);
    expect(redis.del).toHaveBeenCalledWith('patrons:list:v1');
  });

  it('increments existing patron and creates history on repeated value add', async () => {
    const existingPatron = new PatronEntity();
    existingPatron.user_id = 123n;
    existingPatron.value = 100;
    (innerEm.findOne as ReturnType<typeof mock>).mockResolvedValueOnce(
      existingPatron,
    );

    const patron = await service.addPatronValue('123', 50);

    expect(patron).toBe(existingPatron);
    expect(patron.value).toBe(150);

    const persisted = (innerEm.persist as ReturnType<typeof mock>).mock.calls;
    expect(persisted[1]?.[0]).toBeInstanceOf(PatronHistoryEntity);
    expect((persisted[1]?.[0] as PatronHistoryEntity).value).toBe(50);
  });
});
