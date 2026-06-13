import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityRepository } from '@mikro-orm/postgresql';
import { JwtService } from '@nestjs/jwt';

import { BotEntity } from '#core/bots/entities/bot.entity';
import { PermissionGrantEntity } from './entities/permission-grant.entity';
import { PermissionService } from './permissions.service';
import { ActorType, Permission } from './permissions.types';

describe('PermissionService', () => {
  let service: PermissionService;
  let grants: PermissionGrantEntity[];

  beforeEach(() => {
    grants = [];

    const grantsRepository = {
      findOne: mock((where: Partial<PermissionGrantEntity>) =>
        Promise.resolve(
          grants.find(
            (grant) =>
              grant.actorType === where.actorType &&
              grant.actorId === where.actorId &&
              grant.guild_id === where.guild_id &&
              grant.permission === where.permission,
          ) ?? null,
        ),
      ),
    } as unknown as EntityRepository<PermissionGrantEntity>;

    const botsRepository = {
      findOne: mock(() => Promise.resolve(null)),
    } as unknown as EntityRepository<BotEntity>;

    const jwtService = {
      verifyAsync: mock(() => Promise.resolve(null)),
    } as unknown as JwtService;

    service = new PermissionService(
      grantsRepository,
      botsRepository,
      jwtService,
    );
  });

  it('allows user permission from a global grant', async () => {
    grants.push(createGrant(Permission.GuildRead, null));

    const allowed = await service.hasPermission(
      { type: ActorType.User, id: '123', username: 'user' },
      Permission.GuildRead,
    );

    expect(allowed).toBe(true);
  });

  it('allows user permission from a matching guild grant only', async () => {
    grants.push(createGrant(Permission.GuildRead, 10n));

    const actor = {
      type: ActorType.User,
      id: '123',
      username: 'user',
    } as const;

    await expect(
      service.hasPermission(actor, Permission.GuildRead, { guildId: '10' }),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission(actor, Permission.GuildRead, { guildId: '11' }),
    ).resolves.toBe(false);
  });

  it('denies users without a grant for elevated permissions', async () => {
    await expect(
      service.hasPermission(
        { type: ActorType.User, id: '123', username: 'user' },
        Permission.GuildEventsRead,
        { guildId: '10' },
      ),
    ).resolves.toBe(false);
  });

  it('allows bot permissions from token permissions', async () => {
    const bot = new BotEntity();
    bot.id = 1;
    bot.permissions = [Permission.WalletManage];

    await expect(
      service.hasPermission(
        { type: ActorType.Bot, id: '1', bot },
        Permission.WalletManage,
      ),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission(
        { type: ActorType.Bot, id: '1', bot },
        Permission.GuildRead,
      ),
    ).resolves.toBe(false);
  });

  it('allows implicit wallet self-read only for the same user actor', async () => {
    const userActor = {
      type: ActorType.User,
      id: '123',
      username: 'user',
    } as const;
    const bot = new BotEntity();
    bot.id = 1;
    bot.permissions = [];

    await expect(
      service.hasPermission(userActor, Permission.WalletReadOwn, {
        targetUserId: '123',
      }),
    ).resolves.toBe(true);
    await expect(
      service.hasPermission(userActor, Permission.WalletReadOwn, {
        targetUserId: '456',
      }),
    ).resolves.toBe(false);
    await expect(
      service.hasPermission(
        { type: ActorType.Bot, id: '1', bot },
        Permission.WalletReadOwn,
        { targetUserId: '1' },
      ),
    ).resolves.toBe(false);
  });
});

function createGrant(
  permission: Permission,
  guildId: bigint | null,
): PermissionGrantEntity {
  const grant = new PermissionGrantEntity();
  grant.actorType = ActorType.User;
  grant.actorId = 123n;
  grant.guild_id = guildId;
  grant.permission = permission;
  return grant;
}
