import { lookup } from 'node:dns/promises';
import { BadRequestException } from '@nestjs/common';

export const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.!?;:]+$/;

/** Removes a single trailing slash from a URL, if present. */
export function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Guarantees the URL is a public http(s) resource. Use before fetching
 * user-provided direct URLs server-side (SSRF guard): private, loopback and
 * link-local addresses are rejected after DNS resolution.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid source URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('Only http(s) source URLs are supported.');
  }

  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new BadRequestException('Source URL host could not be resolved.');
  }
  if (
    addresses.length === 0 ||
    addresses.some((address) => isPrivateAddress(address.address))
  ) {
    throw new BadRequestException('Source URL host is not allowed.');
  }
  return url;
}

export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  const v4mapped = lower.match(/^::ffff:(.*)$/);
  if (v4mapped) return isPrivateAddress(v4mapped[1]);
  return (
    lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
  );
}

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
