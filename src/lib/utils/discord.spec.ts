import { describe, expect, it } from 'bun:test';
import { GuildMember } from 'discord.js';
import { DISCORD_CDN } from '#config/constants';
import { getAvatarUrl, getDefaultAvatar, getDisplayAvatar } from './discord';

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

  it('builds correct avatar URL from hash', () => {
    const userId = '123456789012345678';
    const hash = 'a_d5efa99b3efaa7dd000c8b9c8e9c8e9c';

    expect(getAvatarUrl(userId, hash)).toBe(
      `${DISCORD_CDN}/avatars/${userId}/${hash}.gif`,
    );
  });

  it('uses png extension for non-animated avatar hash', () => {
    const userId = '123456789012345678';
    const hash = 'd5efa99b3efaa7dd000c8b9c8e9c8e9c';

    expect(getAvatarUrl(userId, hash)).toBe(
      `${DISCORD_CDN}/avatars/${userId}/${hash}.png`,
    );
  });

  it('falls back to default avatar when hash is null', () => {
    const userId = '123456789012345678';
    const defaultUrl = getDefaultAvatar(userId);

    expect(getAvatarUrl(userId, null)).toBe(defaultUrl);
  });

  it('falls back to default avatar when hash is undefined', () => {
    const userId = '123456789012345678';
    const defaultUrl = getDefaultAvatar(userId);

    expect(getAvatarUrl(userId, undefined)).toBe(defaultUrl);
  });
});
