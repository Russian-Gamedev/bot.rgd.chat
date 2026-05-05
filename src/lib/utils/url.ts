const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.!?;:]+$/;

/** Normalizes a URL for repeat detection; returns null for invalid input. */
export function normalizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim().replace(TRAILING_URL_PUNCTUATION, '');
  const withProtocol = trimmed.startsWith('www.')
    ? `https://${trimmed}`
    : trimmed;

  try {
    const url = new URL(withProtocol);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.searchParams.sort();

    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.hostname}${path}${url.search}`;
  } catch {
    return null;
  }
}

/** Extracts unique normalized URLs from free-form text. */
export function extractNormalizedUrls(content: string): string[] {
  const urls = new Set<string>();
  for (const match of content.matchAll(URL_REGEX)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) urls.add(normalized);
  }
  return [...urls];
}
