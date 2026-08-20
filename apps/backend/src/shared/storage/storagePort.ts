/**
 * Abstraction over an S3-compatible object store. Kept deliberately
 * narrow — just enough for portfolio images and booking attachments.
 *
 * `getPublicUrl` is for PUBLIC objects only (portfolio images — meant to
 * appear on the public landing page). Booking attachments are PRIVATE and
 * must never go through this — they're only ever read via `getObject`
 * from an authenticated, tenant-scoped controller endpoint that streams
 * the bytes back after checking authorization. See
 * beautybook-security-measures.md §11 ("не включать photo URLs в
 * публичный booking response").
 */
export interface StoragePort {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}
