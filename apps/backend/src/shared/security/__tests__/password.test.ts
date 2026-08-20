import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../password.js';

describe('hashPassword / verifyPassword', () => {
  it('produces a hash that verifies against the original password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('never returns the plaintext password as the hash', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const hashA = await hashPassword('same-password-123');
    const hashB = await hashPassword('same-password-123');
    expect(hashA).not.toBe(hashB);
  });
});
