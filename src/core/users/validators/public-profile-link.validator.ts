import type { NormalizedPublicProfileLink } from '../normalizers/public-profile-link.normalizer';

const ALLOWED_ICON_RE = /^[a-z0-9_-]+$/i;

export function isValidPublicProfileLink(
  link: NormalizedPublicProfileLink,
): boolean {
  if (link.label.length === 0) return false;
  if (link.icon.length === 0) return false;
  if (link.url.length === 0) return false;
  if (!ALLOWED_ICON_RE.test(link.icon)) return false;

  return isValidHttpsUrl(link.url);
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
