import { randomUUID } from 'node:crypto';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Generates a storage key server-side — NEVER derived from a
 * user-supplied filename (that would be a path-traversal vector and
 * leaks nothing useful anyway; see security-measures.md §10 "не
 * использовать пользовательское имя файла как storage path", §27 path
 * traversal). The extension comes from the SNIFFED mime type
 * (`detectImageMimeType`), never a client-declared one.
 */
export function generateStorageKey(prefix: string, mimeType: string): string {
  const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin';
  const segments = prefix
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return [...segments, `${randomUUID()}.${extension}`].join('/');
}
