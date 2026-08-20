export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * Detects the real image format from its magic bytes (file signature),
 * ignoring whatever Content-Type/extension the client claims — the
 * client-supplied Content-Type can always be spoofed
 * (security-measures.md §10). Returns `null` if the buffer doesn't match
 * any allowed format, including malformed/truncated files.
 */
export function detectImageMimeType(buffer: Buffer): AllowedImageMimeType | null {
  if (isJpeg(buffer)) {
    return 'image/jpeg';
  }
  if (isPng(buffer)) {
    return 'image/png';
  }
  if (isWebp(buffer)) {
    return 'image/webp';
  }
  return null;
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isPng(buffer: Buffer): boolean {
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length < PNG_SIGNATURE.length) {
    return false;
  }
  return PNG_SIGNATURE.every((byte, index) => buffer[index] === byte);
}

function isWebp(buffer: Buffer): boolean {
  // RIFF <4-byte size> WEBP
  if (buffer.length < 12) {
    return false;
  }
  const isRiff =
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  const isWebpFormat =
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  return isRiff && isWebpFormat;
}

export interface ValidateImageUploadResult {
  valid: boolean;
  mimeType?: AllowedImageMimeType;
  error?: string;
}

/**
 * The single authoritative check for any image upload in the app — used
 * by both portfolio images and booking attachments. Size is checked
 * first (cheapest), then the magic-byte sniff (authoritative format
 * check — this is what a "fake extension" or spoofed Content-Type cannot
 * get past).
 */
export function validateImageUpload(
  buffer: Buffer,
  maxSizeBytes: number,
): ValidateImageUploadResult {
  if (buffer.length === 0) {
    return { valid: false, error: 'The uploaded file is empty.' };
  }
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `The uploaded file exceeds the maximum size of ${maxSizeBytes} bytes.`,
    };
  }

  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType) {
    return {
      valid: false,
      error: 'The uploaded file is not a valid JPEG, PNG, or WEBP image.',
    };
  }

  return { valid: true, mimeType: detectedMimeType };
}
