export function createGameSlug(title: string): string {
  return normalizeGameSlug(title) || 'game';
}

export function normalizeGameSlug(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}
