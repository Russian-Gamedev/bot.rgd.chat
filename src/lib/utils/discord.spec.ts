import { describe, expect, it } from 'bun:test';
import { GuildMember } from 'discord.js';

import { getDisplayAvatar } from './discord';

describe('discord utilities', () => {
  it('uses guild member display avatar instead of falling back on missing guild avatar', () => {
    const member = {
      id: '123456789012345678',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/user.webp',
    } as unknown as GuildMember;

    expect(getDisplayAvatar(member)).toBe(
      'https://cdn.discordapp.com/avatars/user.webp',
    );
  });
});
