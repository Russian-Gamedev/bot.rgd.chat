export const GOLDER_SLUG_MAX_LENGTH = 64;

export const GOLDER_NAME_MAX_LENGTH = 200;

export const GOLDER_MAX_TAGS = 10;
export const GOLDER_TAG_MAX_LENGTH = 32;

export const GOLDER_CONTENT_TYPE_PATTERN = /^(image|video|audio)\//;

export const GOLDER_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const GOLDER_PRESIGN_EXPIRES_SECONDS = 15 * 60;

export const GOLDER_DEFAULT_PAGE_LIMIT = 20;
export const GOLDER_MAX_PAGE_LIMIT = 100;

export const GOLDER_TAG_SUGGESTION_LIMIT = 20;

export function normalizeTags(tags: string[]): string[] {
  return [
    ...new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  ];
}

/** Parses a comma-separated tag string with the same normalization as tags. */
export function parseTagsCsv(value: string): string[] {
  return normalizeTags(value.split(',')).slice(0, GOLDER_MAX_TAGS);
}
