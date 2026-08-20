import { describe, expect, it } from 'vitest';

import { isPlainText } from '../plainText.js';

describe('isPlainText', () => {
  it('accepts ordinary text', () => {
    expect(isPlainText('We offer manicures, pedicures & lash extensions.')).toBe(true);
  });

  it('accepts text with quotes and apostrophes', () => {
    expect(isPlainText(`Oslo's best "nail studio" since 2020`)).toBe(true);
  });

  it('rejects a script tag', () => {
    expect(isPlainText('<script>alert(1)</script>')).toBe(false);
  });

  it('rejects any bare angle bracket', () => {
    expect(isPlainText('5 < 10 stars')).toBe(false);
    expect(isPlainText('rated > average')).toBe(false);
  });

  it('rejects an img onerror XSS attempt', () => {
    expect(isPlainText('<img src=x onerror=alert(1)>')).toBe(false);
  });
});
