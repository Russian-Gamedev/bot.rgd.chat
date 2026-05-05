import { Buffer } from 'buffer';
import { createHash } from 'crypto';

/** Returns a SHA-256 hex digest for a string value. */
export function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Returns a SHA-256 hex digest for binary data. */
export function hashArrayBuffer(buffer: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}
