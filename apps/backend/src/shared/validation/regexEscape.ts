const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Escapes every regex metacharacter so the result is safe to embed in a
 * `new RegExp(...)` as a literal substring match. This is the ONLY
 * sanctioned way to build a search regex from user input — see
 * beautybook-security-measures.md §7 ("Regex Injection / ReDoS"). Never
 * construct a RegExp directly from unescaped user input.
 */
export function escapeRegExp(value: string): string {
  return value.replace(REGEX_SPECIAL_CHARS, '\\$&');
}
