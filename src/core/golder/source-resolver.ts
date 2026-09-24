import { BadRequestException } from '@nestjs/common';

import { assertPublicHttpUrl } from '#lib/utils';

import { parseTagsCsv } from './golder.constants';
import { looksLikeMediaUrl, nameFromUrl } from './media-url';

export interface GolderSourceInfo {
  /** Direct media URL to import from; null when nothing media-like was found. */
  mediaUrl: string | null;
  name: string | null;
  tags: string[];
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Tags that carry no value when auto-filled from source pages. */
const NOISE_TAGS = new Set([
  'gif',
  'gifs',
  'animated gif',
  'animatedgif',
  'sticker',
  'stickers',
]);

const TENOR_VIEW_URL_PATTERN = /^https:\/\/(?:[a-z]+\.)?tenor\.com\/view\/.+/i;

const DECODE_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x2F;': '/',
};

/**
 * Resolves a user-provided source URL into media info for auto-fill:
 * - direct media URL -> as-is with a name from the path;
 * - page URL (Tenor and any other html page) -> Open Graph meta:
 *   og:video/og:image become mediaUrl, og:title -> name, keywords -> tags.
 */
export async function resolveSourcePage(
  rawUrl: string,
): Promise<GolderSourceInfo> {
  await assertPublicHttpUrl(rawUrl);

  if (looksLikeMediaUrl(rawUrl)) {
    return { mediaUrl: rawUrl, name: nameFromUrl(rawUrl), tags: [] };
  }

  const response = await fetch(rawUrl, {
    headers: { 'user-agent': BROWSER_USER_AGENT },
  }).catch(() => null);
  if (!response?.ok) {
    throw new BadRequestException('Failed to download the source page.');
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    // Скачался не html (например, файл) — отдаём как прямое медиа.
    return { mediaUrl: rawUrl, name: nameFromUrl(rawUrl), tags: [] };
  }

  return parseSourcePageHtml(rawUrl, await response.text());
}

/** Extracts media/name/tags from Open Graph meta of a page. */
export function parseSourcePageHtml(
  url: string,
  html: string,
): GolderSourceInfo {
  const meta = extractOpenGraph(html);
  const mediaUrl =
    meta['og:video:secure_url'] ??
    meta['og:video'] ??
    meta['twitter:player:stream'] ??
    meta['og:image'] ??
    null;
  const tags = parseTagsCsv(meta['keywords'] ?? '').filter(
    (tag) => !NOISE_TAGS.has(tag),
  );

  return {
    mediaUrl,
    name: cleanSourceName(meta['og:title'] ?? meta['twitter:title']),
    tags,
  };
}

/** True when resolveSourcePage is expected to find media for this URL. */
export function isResolvableSourceUrl(url: string): boolean {
  return TENOR_VIEW_URL_PATTERN.test(url) || looksLikeMediaUrl(url);
}

function extractOpenGraph(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key =
      /(?:property|name)\s*=\s*"([^"]+)"/i.exec(tag)?.[1] ??
      /(?:property|name)\s*=\s*'([^']+)'/i.exec(tag)?.[1];
    const content =
      /content\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ??
      /content\s*=\s*'([^']*)'/i.exec(tag)?.[1];
    if (key && content !== undefined && !(key.toLowerCase() in meta)) {
      meta[key.toLowerCase()] = decodeEntities(content);
    }
  }
  return meta;
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#39|#x2F);/g,
    (entity) => DECODE_ENTITIES[entity] ?? entity,
  );
}

/**
 * Cleans an og:title into a display name:
 * "дамирмомент GIF - Дамирмомент - Discover & Share GIFs" -> "дамирмомент".
 */
function cleanSourceName(title: string | undefined): string | null {
  if (!title) return null;
  const firstSegment = decodeEntities(title).split(/ [-–|] /)[0];
  const withoutFormatSuffix = firstSegment.replace(/\s+gif$/i, '').trim();
  return withoutFormatSuffix.length > 0 ? withoutFormatSuffix : null;
}
