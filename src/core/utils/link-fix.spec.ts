import { describe, expect, it } from 'bun:test';

import { fixMessageLinks } from './link-fix';

describe('fixMessageLinks', () => {
  it('maps each platform to its fix-embed host', () => {
    expect(fixMessageLinks('https://x.com/user/status/1')).toEqual([
      'https://fxtwitter.com/user/status/1',
    ]);
    expect(fixMessageLinks('https://twitter.com/user/status/1')).toEqual([
      'https://fxtwitter.com/user/status/1',
    ]);
    expect(fixMessageLinks('https://instagram.com/p/abc')).toEqual([
      'https://kkinstagram.com/p/abc',
    ]);
    expect(fixMessageLinks('https://tiktok.com/@user/video/1')).toEqual([
      'https://d.tnktok.com/@user/video/1',
    ]);
    expect(fixMessageLinks('https://www.tiktok.com/@user/video/1')).toEqual([
      'https://d.tnktok.com/@user/video/1',
    ]);
  });

  it('preserves path, query and hash', () => {
    expect(fixMessageLinks('https://x.com/user/status/1?s=20&t=abc#m')).toEqual(
      ['https://fxtwitter.com/user/status/1?s=20&t=abc#m'],
    );
  });

  it('matches www. and m. subdomains', () => {
    expect(fixMessageLinks('https://www.instagram.com/reel/abc')).toEqual([
      'https://kkinstagram.com/reel/abc',
    ]);
    expect(fixMessageLinks('https://m.instagram.com/reel/abc')).toEqual([
      'https://kkinstagram.com/reel/abc',
    ]);
    expect(fixMessageLinks('www.x.com/user/status/1')).toEqual([
      'https://fxtwitter.com/user/status/1',
    ]);
  });

  it('returns null for already-fixed hosts', () => {
    expect(fixMessageLinks('https://fxtwitter.com/user/status/1')).toBeNull();
    expect(fixMessageLinks('https://kkinstagram.com/p/abc')).toBeNull();
    expect(fixMessageLinks('https://d.tnktok.com/@user/video/1')).toBeNull();
  });

  it('returns null for foreign links and plain text', () => {
    expect(fixMessageLinks('https://example.com/page')).toBeNull();
    expect(fixMessageLinks('no links here')).toBeNull();
    expect(fixMessageLinks('')).toBeNull();
  });

  it('extracts every fixable link from a message', () => {
    expect(
      fixMessageLinks(
        'cat https://x.com/a/status/1 dog https://instagram.com/p/abc end',
      ),
    ).toEqual([
      'https://fxtwitter.com/a/status/1',
      'https://kkinstagram.com/p/abc',
    ]);
  });

  it('deduplicates links leading to the same result', () => {
    expect(
      fixMessageLinks(
        'https://x.com/a/status/1 https://twitter.com/a/status/1',
      ),
    ).toEqual(['https://fxtwitter.com/a/status/1']);
  });

  it('ignores invalid urls and trailing punctuation', () => {
    expect(fixMessageLinks('go to https://x.com/a/status/1.')).toEqual([
      'https://fxtwitter.com/a/status/1',
    ]);
    expect(fixMessageLinks('https://[invalid')).toBeNull();
  });
});
