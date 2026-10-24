import { URL_REGEX } from '#lib/utils/url';

const TRAILING_URL_PUNCTUATION = /[),.!?;:]+$/;

/** Embed-hostile hostnames (after stripping `www.`/`m.`) mapped to their fix-embed replacements. */
const LINK_FIX_HOSTS: Record<string, string> = {
  'x.com': 'fxtwitter.com',
  'twitter.com': 'fxtwitter.com',
  'instagram.com': 'kkinstagram.com',
  'tiktok.com': 'd.tnktok.com',
};

export interface FixableLink {
  /** Every spelling of the same link found in the message. */
  originals: string[];
  /** Canonical fix-embed URL shared by the originals. */
  fixed: string;
}

function fixUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.replace(TRAILING_URL_PUNCTUATION, '');
  const withProtocol = trimmed.startsWith('www.')
    ? `https://${trimmed}`
    : trimmed;

  try {
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
    const target = LINK_FIX_HOSTS[host];
    if (!target) return null;

    return `https://${target}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Groups fix-embed replacements in a message by their resulting URL. */
export function findFixableLinks(content: string): FixableLink[] {
  const byFixed = new Map<string, string[]>();

  for (const match of content.matchAll(URL_REGEX)) {
    const original = match[0].replace(TRAILING_URL_PUNCTUATION, '');
    const fixed = fixUrl(original);
    if (!fixed) continue;

    const originals = byFixed.get(fixed);
    if (!originals) {
      byFixed.set(fixed, [original]);
    } else if (!originals.includes(original)) {
      originals.push(original);
    }
  }

  return [...byFixed].map(([fixed, originals]) => ({ fixed, originals }));
}

/** Replaces every original link in the content with its fix-embed URL. */
export function applyFixableLinks(
  content: string,
  links: readonly FixableLink[],
): string {
  const replacements = new Map<string, string>();
  for (const link of links) {
    for (const original of link.originals) {
      replacements.set(original, link.fixed);
    }
  }
  if (replacements.size === 0) return content;

  return content.replace(URL_REGEX, (match) => {
    const original = match.replace(TRAILING_URL_PUNCTUATION, '');
    const fixed = replacements.get(original);
    if (fixed === undefined) return match;

    return `${fixed}${match.slice(original.length)}`;
  });
}
