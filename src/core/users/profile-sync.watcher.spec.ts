import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { EntityManager } from '@mikro-orm/postgresql';

import { DiscordProfileSyncService } from './discord-profile-sync.service';
import { ProfileSyncWatcher } from './profile-sync.watcher';
import { PublicProfileService } from './public-profile.service';

describe('ProfileSyncWatcher', () => {
  let watcher: ProfileSyncWatcher;
  let discordProfileSync: DiscordProfileSyncService;
  let publicProfileService: PublicProfileService;

  beforeEach(() => {
    discordProfileSync = {
      syncUser: mock(() => Promise.resolve()),
      syncMember: mock(() => Promise.resolve()),
    } as unknown as DiscordProfileSyncService;
    publicProfileService = {
      invalidateProfileCache: mock(() => Promise.resolve()),
    } as unknown as PublicProfileService;

    watcher = new ProfileSyncWatcher(
      createEntityManager(),
      discordProfileSync,
      publicProfileService,
    );
  });

  it('syncs updated users and invalidates both usernames', async () => {
    const oldUser = createUser('123', 'alice-old');
    const newUser = createUser('123', 'alice');

    await watcher.onUserUpdate([oldUser, newUser] as never);

    expect(discordProfileSync.syncUser).toHaveBeenCalledWith(newUser);
    expect(publicProfileService.invalidateProfileCache).toHaveBeenCalledWith({
      user_id: 123n,
      username: 'alice',
    });
    expect(publicProfileService.invalidateProfileCache).toHaveBeenCalledWith({
      user_id: 123n,
      username: 'alice-old',
    });
  });

  it('invalidates only the current username when it did not change', async () => {
    const user = createUser('123', 'alice');

    await watcher.onUserUpdate([user, user] as never);

    expect(publicProfileService.invalidateProfileCache).toHaveBeenCalledTimes(
      1,
    );
  });

  it('ignores bot user updates', async () => {
    const user = createUser('123', 'bot', true);

    await watcher.onUserUpdate([user, user] as never);

    expect(discordProfileSync.syncUser).not.toHaveBeenCalled();
    expect(publicProfileService.invalidateProfileCache).not.toHaveBeenCalled();
  });

  it('syncs the member and invalidates the profile cache', async () => {
    const member = createMember('123', 'alice');

    await watcher.onGuildMemberUpdate([member, member] as never);

    expect(discordProfileSync.syncMember).toHaveBeenCalledWith(member);
    expect(publicProfileService.invalidateProfileCache).toHaveBeenCalledWith({
      user_id: 123n,
      username: 'alice',
    });
  });

  it('ignores bots', async () => {
    const member = createMember('123', 'bot', true);

    await watcher.onGuildMemberUpdate([member, member] as never);

    expect(discordProfileSync.syncMember).not.toHaveBeenCalled();
    expect(publicProfileService.invalidateProfileCache).not.toHaveBeenCalled();
  });

  it('keeps the profile cache when the sync fails', async () => {
    const member = createMember('123', 'alice');
    (
      discordProfileSync.syncMember as ReturnType<typeof mock>
    ).mockRejectedValueOnce(new Error('Discord unavailable'));

    await watcher.onGuildMemberUpdate([member, member] as never);

    expect(publicProfileService.invalidateProfileCache).not.toHaveBeenCalled();
  });
});

function createMember(id: string, username: string, bot = false) {
  return {
    id,
    user: { bot, username },
    guild: { id: '456' },
  } as never;
}

function createUser(id: string, username: string, bot = false) {
  return { id, bot, username } as never;
}

function createEntityManager(): EntityManager {
  const em = Object.create(EntityManager.prototype) as EntityManager;
  Object.defineProperty(em, 'name', { value: 'default' });
  Object.defineProperty(em, 'fork', { value: () => em });
  return em;
}
