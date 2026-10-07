import { randomUUID } from 'node:crypto';

/** Builds an S3 object key: `{prefix}/{uuid}.{sanitized extension}`. */
export function buildObjectKey(prefix: string, contentType: string): string {
  const rawExtension = contentType.split('/')[1] ?? '';
  const extension =
    rawExtension.replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  return `${prefix}/${randomUUID()}.${extension}`;
}
