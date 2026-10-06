import { describe, expect, it } from 'bun:test';

import { parseSourcePageHtml } from './source-resolver';

const TENOR_HTML = `
<html><head>
<meta class="dynamic" name="keywords" content="Дамирмомент,gif,animated gif,gifs,meme">
<meta class="dynamic" property="og:title" content="дамирмомент GIF - Дамирмомент - Discover &amp; Share GIFs">
<meta class="dynamic" name="twitter:player:stream" content="https://media.tenor.com/NwlR4jFS9GMAAAPo/video.mp4">
<meta class="dynamic" property="og:image" content="https://media1.tenor.com/m/NwlR4jFS9GMAAAAC/image.gif">
</head></html>
`;

describe('parseSourcePageHtml', () => {
  it('parses open graph meta into media, name and tags', () => {
    const info = parseSourcePageHtml(
      'https://tenor.com/view/%D0%B4%D0%B0%D0%BC%D0%B8%D1%80%D0%BC%D0%BE%D0%BC%D0%B5%D0%BD%D1%82-gif-25994247',
      TENOR_HTML,
    );

    expect(info.mediaUrl).toBe(
      'https://media.tenor.com/NwlR4jFS9GMAAAPo/video.mp4',
    );
    expect(info.name).toBe('дамирмомент');
    expect(info.tags).toEqual(['дамирмомент', 'meme']);
  });

  it('returns null media when the page has none', () => {
    const info = parseSourcePageHtml(
      'https://example.com/post',
      '<html><head><title>Post</title></head></html>',
    );

    expect(info.mediaUrl).toBeNull();
    expect(info.name).toBeNull();
    expect(info.tags).toEqual([]);
  });
});
