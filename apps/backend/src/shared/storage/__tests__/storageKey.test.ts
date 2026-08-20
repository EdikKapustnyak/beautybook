import { describe, expect, it } from 'vitest';

import { generateStorageKey } from '../storageKey.js';

describe('generateStorageKey', () => {
  it('produces a key under the given prefix with the correct extension', () => {
    const key = generateStorageKey('portfolio/company-1', 'image/jpeg');
    expect(key).toMatch(/^portfolio\/company-1\/[0-9a-f-]{36}\.jpg$/);
  });

  it('maps each allowed mime type to its correct extension', () => {
    expect(generateStorageKey('p', 'image/jpeg')).toMatch(/\.jpg$/);
    expect(generateStorageKey('p', 'image/png')).toMatch(/\.png$/);
    expect(generateStorageKey('p', 'image/webp')).toMatch(/\.webp$/);
  });

  it('produces a different key on every call (no collisions in practice)', () => {
    const a = generateStorageKey('portfolio/company-1', 'image/jpeg');
    const b = generateStorageKey('portfolio/company-1', 'image/jpeg');
    expect(a).not.toBe(b);
  });

  it('never incorporates a user-supplied filename — the function does not even accept one', () => {
    const key = generateStorageKey('booking-attachments/company-1/booking-1', 'image/png');
    expect(key).not.toContain('..');
    expect(key).not.toContain('<');
    expect(key).not.toContain('>');
  });

  it('strips empty/whitespace-only prefix segments', () => {
    const key = generateStorageKey('portfolio//company-1/', 'image/jpeg');
    expect(key.startsWith('portfolio/company-1/')).toBe(true);
  });
});
