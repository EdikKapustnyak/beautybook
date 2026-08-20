import { describe, expect, it } from 'vitest';

import { escapeRegExp } from '../regexEscape.js';

describe('escapeRegExp', () => {
  it('leaves plain alphanumeric text unchanged', () => {
    expect(escapeRegExp('Kari Nordmann')).toBe('Kari Nordmann');
    expect(escapeRegExp('+4791234567')).toBe('\\+4791234567');
  });

  it('escapes every regex metacharacter', () => {
    expect(escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('neutralizes a classic regex injection attempt', () => {
    const malicious = '.*';
    const escaped = escapeRegExp(malicious);
    const regex = new RegExp(escaped, 'i');
    // Without escaping, `.*` would match literally anything. Escaped, it
    // only matches the literal two-character string ".*".
    expect(regex.test('any random customer name')).toBe(false);
    expect(regex.test('contains .* literally')).toBe(true);
  });

  it('neutralizes a classic ReDoS payload — matching completes instantly, not catastrophically', () => {
    const redosPayload = '(a+)+$';
    const escaped = escapeRegExp(redosPayload);
    const regex = new RegExp(escaped, 'i');

    const longInput = 'a'.repeat(50) + '!'; // would hang an UNescaped (a+)+$ pattern
    const start = performance.now();
    regex.test(longInput);
    const elapsedMs = performance.now() - start;

    expect(elapsedMs).toBeLessThan(50);
  });

  it('produces a regex that only matches the literal input as a substring', () => {
    const escaped = escapeRegExp('a.b');
    const regex = new RegExp(escaped);
    expect(regex.test('xa.by')).toBe(true); // literal "a.b" present
    expect(regex.test('axb')).toBe(false); // "." must be literal, not "any char"
  });
});
