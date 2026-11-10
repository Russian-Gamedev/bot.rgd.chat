import { describe, expect, it } from 'bun:test';

import { buildAuthLogEmbed } from './auth.embed';

describe('auth log embed', () => {
  it('mentions the member and links the site', () => {
    const embed = buildAuthLogEmbed({
      userId: '111',
      username: 'User',
      siteUrl: 'https://rgd.chat',
    });

    expect(embed.data.title).toBe('Авторизация на сайте');
    expect(embed.data.description).toContain('<@111>');
    expect(embed.data.description).toContain('[rgd.chat](https://rgd.chat)');
  });

  it('works without a site url', () => {
    const embed = buildAuthLogEmbed({ userId: '111', username: 'User' });

    expect(embed.data.description).toContain('rgd.chat');
    expect(embed.data.description).not.toContain('[');
  });
});
