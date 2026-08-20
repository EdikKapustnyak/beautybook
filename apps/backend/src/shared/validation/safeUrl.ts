const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:']);

/**
 * True if the value is a syntactically valid URL using an allowed scheme.
 * Rejects `javascript:`, `data:`, `vbscript:`, and any other scheme — see
 * beautybook-security-measures.md §8 (URL scheme allowlist).
 */
export function isSafeUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ALLOWED_URL_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}
