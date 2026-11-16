import { describe, expect, it, mock } from 'bun:test';
import type { GuildTextBasedChannel, Invite } from 'discord.js';

import { GuildInviteEntity } from './entities/invite.entity';
import { GuildInviteService } from './invite.service';

const GUILD_ID = '111111111111111111';
const CHANNEL_ID = '222222222222222222';
const INVITER_ID = '333333333333333333';

function createService() {
  const inviteRepository = {
    findOne: mock(async () => null),
    find: mock(async () => []),
  };
  const entityManager = {
    upsert: mock(async () => undefined),
    persist: mock(() => ({ flush: async () => undefined })),
    remove: mock(() => ({ flush: async () => undefined })),
    flush: mock(async () => undefined),
  };
  const service = new GuildInviteService(
    inviteRepository as never,
    {} as never,
    entityManager as never,
    {} as never,
  );

  return { service, entityManager };
}

function createChannel(invite: Record<string, unknown>) {
  const create = mock(
    async (_channelId: string, _options: unknown) =>
      invite as unknown as Invite,
  );
  const channel = {
    id: CHANNEL_ID,
    guildId: GUILD_ID,
    guild: { invites: { create } },
  } as unknown as GuildTextBasedChannel;

  return { channel, create };
}

describe('GuildInviteService', () => {
  it('ignores an inviteCreate row that already exists', async () => {
    const { service, entityManager } = createService();
    const invite = {
      code: 'abc123',
      guild: { id: GUILD_ID },
      uses: 5,
      inviter: { id: INVITER_ID },
    } as unknown as Invite;

    await service.create(invite);

    expect(entityManager.upsert).toHaveBeenCalledWith(
      GuildInviteEntity,
      {
        id: 'abc123',
        guild_id: GUILD_ID,
        uses: 5,
        inviter_id: INVITER_ID,
      },
      { onConflictFields: ['id'], onConflictAction: 'ignore' },
    );
  });

  it('creates a never-expiring invite and stores its alias', async () => {
    const { service, entityManager } = createService();
    const { channel, create } = createChannel({
      code: 'new123',
      guild: { id: GUILD_ID },
      uses: 0,
      inviter: { id: INVITER_ID },
    });

    const invite = await service.createPermanentInvite(channel, '999', 'Сайт');

    expect(create).toHaveBeenCalledWith(CHANNEL_ID, {
      maxAge: 0,
      maxUses: 0,
      unique: true,
      reason: 'Приглашение с alias «Сайт»',
    });
    expect(entityManager.upsert).toHaveBeenCalledWith(
      GuildInviteEntity,
      {
        id: 'new123',
        guild_id: GUILD_ID,
        uses: 0,
        inviter_id: INVITER_ID,
        name: 'Сайт',
      },
      { onConflictFields: ['id'], onConflictAction: 'merge' },
    );
    expect(invite.code).toBe('new123');
  });

  it('falls back to the invoking user when the invite has no inviter', async () => {
    const { service, entityManager } = createService();
    const { channel } = createChannel({
      code: 'new123',
      guild: { id: GUILD_ID },
      uses: 0,
      inviter: null,
    });

    await service.createPermanentInvite(channel, '999', 'Сайт');

    expect(entityManager.upsert).toHaveBeenCalledWith(
      GuildInviteEntity,
      expect.objectContaining({ inviter_id: '999' }),
      expect.anything(),
    );
  });
});
