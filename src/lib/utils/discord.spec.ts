import { describe, expect, it } from 'bun:test';
import { GuildMember } from 'discord.js';
import { DISCORD_CDN } from '#config/constants';
import {
  getAvatarUrl,
  getDefaultAvatar,
  getDisplayAvatar,
  getEmojiId,
  replaceImageExtension,
} from './discord';

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

  it('replaces webp extension with png preserving query string', () => {
    const url = 'https://cdn.discordapp.com/avatars/123/hash.webp?size=1024';

    expect(replaceImageExtension(url, 'png')).toBe(
      'https://cdn.discordapp.com/avatars/123/hash.png?size=1024',
    );
  });

  it('replaces webp extension with gif', () => {
    const url = 'https://cdn.discordapp.com/avatars/123/hash.webp';

    expect(replaceImageExtension(url, 'gif')).toBe(
      'https://cdn.discordapp.com/avatars/123/hash.gif',
    );
  });

  it('replaces png extension on default embed avatar', () => {
    const url = 'https://cdn.discordapp.com/embed/avatars/0.png';

    expect(replaceImageExtension(url, 'webp')).toBe(
      'https://cdn.discordapp.com/embed/avatars/0.webp',
    );
  });

  it('extracts id from a custom emoji tag', () => {
    expect(getEmojiId('<:coin:1428759054402191482>')).toBe(
      '1428759054402191482',
    );
  });

  it('extracts id from an animated custom emoji tag', () => {
    expect(getEmojiId('<a:coin_flip:1428758842602426560>')).toBe(
      '1428758842602426560',
    );
  });

  it('throws on a unicode emoji', () => {
    expect(() => getEmojiId('🥇')).toThrow('Not a custom emoji tag: 🥇');
  });
});
