import { describe, expect, it } from 'vitest';

import {
  generateOpaqueToken,
  hashOpaqueToken,
  signAccessToken,
  verifyAccessToken,
} from '../tokens.js';

const SECRET = 'a'.repeat(32);

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a payload', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'owner' }, SECRET, 900);
    const payload = verifyAccessToken<{ sub: string; role: string }>(token, SECRET);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('owner');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signAccessToken({ sub: 'user-1' }, SECRET, 900);
    expect(() => verifyAccessToken(token, 'b'.repeat(32))).toThrow();
  });

  it('rejects a garbage token with a generic error, not a parser crash', () => {
    expect(() => verifyAccessToken('not-a-jwt', SECRET)).toThrow(/invalid or expired/i);
  });

  it('rejects an expired token', () => {
    const token = signAccessToken({ sub: 'user-1' }, SECRET, -1);
    expect(() => verifyAccessToken(token, SECRET)).toThrow(/invalid or expired/i);
  });
});

describe('generateOpaqueToken / hashOpaqueToken', () => {
  it('generates a sufficiently long, unique token each time', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hashes deterministically (same input -> same hash)', () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });

  it('produces a different hash for a different token', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(hashOpaqueToken(a)).not.toBe(hashOpaqueToken(b));
  });

  it('the hash never equals the original plaintext token', () => {
    const token = generateOpaqueToken();
    expect(hashOpaqueToken(token)).not.toBe(token);
  });
});
