import {
  MAX_PUBLIC_PROFILE_LINK_ICON_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_LABEL_LENGTH,
  MAX_PUBLIC_PROFILE_LINK_URL_LENGTH,
  MAX_PUBLIC_PROFILE_LINKS,
} from '../constants/public-profile.constants';
import { isValidPublicProfileLink } from '../validators/public-profile-link.validator';

export interface NormalizedPublicProfileLink {
  label: string;
  icon: string;
  url: string;
}

export function normalizePublicProfileLinks(
  value: unknown,
): NormalizedPublicProfileLink[] {
  if (!Array.isArray(value)) return [];

  const result: NormalizedPublicProfileLink[] = [];

  for (const item of value) {
    const normalized = normalizePublicProfileLink(item);
    if (!normalized) continue;

    result.push(normalized);
    if (result.length >= MAX_PUBLIC_PROFILE_LINKS) break;
  }

  return result;
}

function normalizePublicProfileLink(
  value: unknown,
): NormalizedPublicProfileLink | null {
  if (!isObject(value)) return null;

  const link = {
    label: normalizeString(value.label, MAX_PUBLIC_PROFILE_LINK_LABEL_LENGTH),
    icon: normalizeString(value.icon, MAX_PUBLIC_PROFILE_LINK_ICON_LENGTH),
    url: normalizeString(value.url, MAX_PUBLIC_PROFILE_LINK_URL_LENGTH),
  };

  return isValidPublicProfileLink(link) ? link : null;
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';

  return value.trim().slice(0, maxLength);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
