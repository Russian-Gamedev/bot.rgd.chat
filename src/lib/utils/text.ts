const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;

type PluralizeForms = [string, string, string];

/** class-transformer Transform helper: trims string values, leaves others as-is. */
export function trimString({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

/** Normalizes user text for stable spam/repeat comparisons. */
export function normalizeMessageText(content: string): string {
  return content
    .replace(ZERO_WIDTH_REGEX, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Selects the correct Russian plural form for a number. */
export function pluralize(count: number, [one, few, many]: PluralizeForms) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return one;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return few;
  }

  return many;
}
