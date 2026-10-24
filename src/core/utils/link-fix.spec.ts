import { describe, expect, it } from 'bun:test';

import { applyFixableLinks, findFixableLinks } from './link-fix';

describe('findFixableLinks', () => {
  it('maps each platform to its fix-embed host', () => {
    expect(findFixableLinks('https://x.com/user/status/1')).toEqual([
      {
        originals: ['https://x.com/user/status/1'],
        fixed: 'https://fxtwitter.com/user/status/1',
      },
    ]);
    expect(findFixableLinks('https://twitter.com/user/status/1')).toEqual([
      {
        originals: ['https://twitter.com/user/status/1'],
        fixed: 'https://fxtwitter.com/user/status/1',
      },
    ]);
    expect(findFixableLinks('https://instagram.com/p/abc')).toEqual([
      {
        originals: ['https://instagram.com/p/abc'],
        fixed: 'https://kkinstagram.com/p/abc',
      },
    ]);
    expect(findFixableLinks('https://tiktok.com/@user/video/1')).toEqual([
      {
        originals: ['https://tiktok.com/@user/video/1'],
        fixed: 'https://d.tnktok.com/@user/video/1',
      },
    ]);
  });

  it('preserves path, query and hash', () => {
    expect(
      findFixableLinks('https://x.com/user/status/1?s=20&t=abc#m'),
    ).toEqual([
      {
        originals: ['https://x.com/user/status/1?s=20&t=abc#m'],
        fixed: 'https://fxtwitter.com/user/status/1?s=20&t=abc#m',
      },
    ]);
  });

  it('matches www. and m. subdomains', () => {
    expect(findFixableLinks('https://www.instagram.com/reel/abc')).toEqual([
      {
        originals: ['https://www.instagram.com/reel/abc'],
        fixed: 'https://kkinstagram.com/reel/abc',
      },
    ]);
    expect(findFixableLinks('https://m.instagram.com/reel/abc')).toEqual([
      {
        originals: ['https://m.instagram.com/reel/abc'],
        fixed: 'https://kkinstagram.com/reel/abc',
      },
    ]);
    expect(findFixableLinks('www.x.com/user/status/1')).toEqual([
      {
        originals: ['www.x.com/user/status/1'],
        fixed: 'https://fxtwitter.com/user/status/1',
      },
    ]);
  });

  it('returns nothing for already-fixed hosts', () => {
    expect(findFixableLinks('https://fxtwitter.com/user/status/1')).toEqual([]);
    expect(findFixableLinks('https://kkinstagram.com/p/abc')).toEqual([]);
    expect(findFixableLinks('https://d.tnktok.com/@user/video/1')).toEqual([]);
  });

  it('returns nothing for foreign links and plain text', () => {
    expect(findFixableLinks('https://example.com/page')).toEqual([]);
    expect(findFixableLinks('no links here')).toEqual([]);
    expect(findFixableLinks('')).toEqual([]);
  });

  it('extracts every fixable link from a message', () => {
    expect(
      findFixableLinks(
        'cat https://x.com/a/status/1 dog https://instagram.com/p/abc end',
      ),
    ).toEqual([
      {
        originals: ['https://x.com/a/status/1'],
        fixed: 'https://fxtwitter.com/a/status/1',
      },
      {
        originals: ['https://instagram.com/p/abc'],
        fixed: 'https://kkinstagram.com/p/abc',
      },
    ]);
  });

  it('groups different spellings leading to the same fix-embed url', () => {
    expect(
      findFixableLinks(
        'https://x.com/a/status/1 https://twitter.com/a/status/1',
      ),
    ).toEqual([
      {
        originals: [
          'https://x.com/a/status/1',
          'https://twitter.com/a/status/1',
        ],
        fixed: 'https://fxtwitter.com/a/status/1',
      },
    ]);
  });

  it('ignores invalid urls and trailing punctuation', () => {
    expect(findFixableLinks('go to https://x.com/a/status/1.')).toEqual([
      {
        originals: ['https://x.com/a/status/1'],
        fixed: 'https://fxtwitter.com/a/status/1',
      },
    ]);
    expect(findFixableLinks('https://[invalid')).toEqual([]);
  });
});

describe('applyFixableLinks', () => {
  it('replaces links and preserves surrounding text and punctuation', () => {
    const content = 'look https://x.com/a/status/1.';
    expect(applyFixableLinks(content, findFixableLinks(content))).toBe(
      'look https://fxtwitter.com/a/status/1.',
    );
  });

  it('replaces every occurrence and every spelling of the same link', () => {
    const content =
      'https://x.com/a/status/1 and https://twitter.com/a/status/1 and https://x.com/a/status/1';
    expect(applyFixableLinks(content, findFixableLinks(content))).toBe(
      'https://fxtwitter.com/a/status/1 and https://fxtwitter.com/a/status/1 and https://fxtwitter.com/a/status/1',
    );
  });

  it('leaves unrelated links and text untouched', () => {
    const content =
      'see https://example.com/page and https://x.com/a/status/1 now';
    expect(applyFixableLinks(content, findFixableLinks(content))).toBe(
      'see https://example.com/page and https://fxtwitter.com/a/status/1 now',
    );
  });

  it('returns content unchanged when there is nothing to replace', () => {
    expect(applyFixableLinks('no links here', [])).toBe('no links here');
    expect(
      applyFixableLinks(
        'https://example.com/page',
        findFixableLinks('https://x.com/a/status/1'),
      ),
    ).toBe('https://example.com/page');
  });
});
