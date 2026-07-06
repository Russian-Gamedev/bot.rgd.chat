import { MAX_PUBLIC_PROFILE_ABOUT_LENGTH } from '../constants/public-profile.constants';
import type { UserProfileInfo } from '../entities/user-profile.entity';
import {
  type NormalizedPublicProfileLink,
  normalizePublicProfileLinks,
} from './public-profile-link.normalizer';

export interface NormalizedPublicProfileInfo {
  about: string | null;
  links: NormalizedPublicProfileLink[];
}

export function normalizePublicProfileInfo(
  value: unknown,
  options: { legacyAbout?: unknown } = {},
): NormalizedPublicProfileInfo {
  const source = isObject(value) ? (value as Partial<UserProfileInfo>) : {};

  return {
    about: normalizeAbout(source.about ?? options.legacyAbout),
    links: normalizePublicProfileLinks(source.links),
  };
}

function normalizeAbout(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  return trimmed.slice(0, MAX_PUBLIC_PROFILE_ABOUT_LENGTH);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
