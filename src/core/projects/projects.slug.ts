export function createProjectSlug(title: string): string {
  return normalizeProjectSlug(title) || 'project';
}

export function normalizeProjectSlug(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}
