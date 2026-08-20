const HTML_LIKE_PATTERN = /[<>]/;

/**
 * True if the value contains no `<`/`>` characters, i.e. it can't smuggle
 * an HTML/script tag. This is a defense-in-depth check at the input
 * validation layer — output is still React-escaped, and this does NOT
 * replace CSP. See beautybook-security-measures.md §8: "Description —
 * обычный текст", no arbitrary HTML/JS is ever accepted for these fields.
 */
export function isPlainText(value: string): boolean {
  return !HTML_LIKE_PATTERN.test(value);
}
