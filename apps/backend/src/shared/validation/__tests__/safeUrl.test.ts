import { describe, expect, it } from 'vitest';

import { isSafeUrl } from '../safeUrl.js';

describe('isSafeUrl', () => {
  it('accepts an https URL', () => {
    expect(isSafeUrl('https://cdn.example.com/logo.png')).toBe(true);
  });

  it('accepts an http URL', () => {
    expect(isSafeUrl('http://localhost:4000/logo.png')).toBe(true);
  });

  it('rejects javascript: scheme', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: scheme', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects vbscript: scheme', () => {
    expect(isSafeUrl('vbscript:msgbox("x")')).toBe(false);
  });

  it('rejects a malformed URL', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});
