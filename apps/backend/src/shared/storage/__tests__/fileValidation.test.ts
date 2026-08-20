import { describe, expect, it } from 'vitest';

import { detectImageMimeType, validateImageUpload } from '../fileValidation.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const GIF_BYTES = Buffer.from('GIF89a', 'ascii');
const HTML_BYTES = Buffer.from('<html><script>alert(1)</script></html>', 'ascii');

describe('detectImageMimeType', () => {
  it('detects a JPEG by its magic bytes', () => {
    expect(detectImageMimeType(JPEG_BYTES)).toBe('image/jpeg');
  });

  it('detects a PNG by its magic bytes', () => {
    expect(detectImageMimeType(PNG_BYTES)).toBe('image/png');
  });

  it('detects a WEBP by its magic bytes (RIFF....WEBP)', () => {
    expect(detectImageMimeType(WEBP_BYTES)).toBe('image/webp');
  });

  it('returns null for a disallowed format (GIF) even though it is a real image', () => {
    expect(detectImageMimeType(GIF_BYTES)).toBeNull();
  });

  it('returns null for non-image content (HTML/script) — the fake-extension/polyglot defense', () => {
    expect(detectImageMimeType(HTML_BYTES)).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(detectImageMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for a truncated/malformed buffer shorter than any signature', () => {
    expect(detectImageMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('is not fooled by a JPEG-like prefix that is actually something else (WEBP RIFF header mismatch)', () => {
    const fakeRiff = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(detectImageMimeType(fakeRiff)).toBeNull();
  });
});

describe('validateImageUpload', () => {
  const maxSize = 5 * 1024 * 1024; // 5MB

  it('accepts a valid JPEG within the size limit', () => {
    const result = validateImageUpload(JPEG_BYTES, maxSize);
    expect(result.valid).toBe(true);
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('rejects an empty file', () => {
    const result = validateImageUpload(Buffer.alloc(0), maxSize);
    expect(result.valid).toBe(false);
  });

  it('rejects a file exceeding the size limit', () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(maxSize)]);
    const result = validateImageUpload(oversized, maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/exceeds the maximum size/i);
  });

  it('rejects content whose real bytes are not an allowed image format', () => {
    const result = validateImageUpload(HTML_BYTES, maxSize);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a valid/i);
  });

  it('rejects a disallowed-but-real image format (GIF)', () => {
    const result = validateImageUpload(GIF_BYTES, maxSize);
    expect(result.valid).toBe(false);
  });
});
