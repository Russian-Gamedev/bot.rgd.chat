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

const RU_TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/**
 * Converts text into a URL-friendly latin slug: transliterates Russian,
 * lowercases, collapses non-alphanumerics into dashes. Returns '' when
 * nothing survives (e.g. the name was all-emoji).
 */
export function slugify(value: string, maxLength = 64): string {
  const translit = [...value.toLowerCase()]
    .map((char) => RU_TRANSLIT[char] ?? char)
    .join('');
  const slug = translit.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug.length <= maxLength) {
    return slug;
  }
  return slug.slice(0, maxLength).replace(/-+$/g, '');
}
