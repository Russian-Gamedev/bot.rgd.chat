/**
 * URL helpers for golder media sources: tells apart direct media files
 * from regular pages and derives names/content types from URLs.
 */

const MEDIA_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'ogg',
]);

/** True when the URL path ends with a supported media extension. */
export function looksLikeMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const extension = extensionFromUrl(url);
  return MEDIA_EXTENSIONS.has(extension);
}

/** Guesses the content type from the URL file extension; null if unknown. */
export function contentTypeFromUrl(url: string): string | null {
  const extension = extensionFromUrl(url);
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'mp4') return 'video/mp4';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'ogg') return 'audio/ogg';
  return null;
}

/** Display name from an URL: "…/Котик%20играет.mov?x=1" -> "Котик играет". */
export function nameFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const basename = decodeURIComponent(path.split('/').pop() ?? '');
    const withoutExtension = basename.replace(/\.[^.]+$/, '').trim();
    return withoutExtension.length > 0 ? withoutExtension : null;
  } catch {
    return null;
  }
}

function extensionFromUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.split('.').pop()?.toLowerCase() ?? '';
}
