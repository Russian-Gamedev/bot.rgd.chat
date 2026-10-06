import { URL_REGEX } from '#lib/utils/url';

const TRAILING_URL_PUNCTUATION = /[),.!?;:]+$/;

/** Embed-hostile hostnames (after stripping `www.`/`m.`) mapped to their fix-embed replacements. */
const LINK_FIX_HOSTS: Record<string, string> = {
  'x.com': 'fxtwitter.com',
  'twitter.com': 'fxtwitter.com',
  'instagram.com': 'kkinstagram.com',
  'tiktok.com': 'd.tnktok.com',
};

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

/** Extracts fix-embed replacements for a message's links; null when nothing needs fixing. */
export function fixMessageLinks(content: string): string[] | null {
  const links = new Set<string>();
  for (const match of content.matchAll(URL_REGEX)) {
    const fixed = fixUrl(match[0]);
    if (fixed) links.add(fixed);
  }

  return links.size > 0 ? [...links] : null;
}
