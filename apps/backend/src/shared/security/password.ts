import bcrypt from 'bcryptjs';

// Cost factor 12 is a reasonable 2026 default for bcrypt (bounded work
// factor, doesn't need to be configurable per-request). bcrypt itself also
// silently truncates input at 72 bytes, hence the upper bound below.
const BCRYPT_COST_FACTOR = 12;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

export async function hashPassword(plaintextPassword: string): Promise<string> {
  return bcrypt.hash(plaintextPassword, BCRYPT_COST_FACTOR);
}

export async function verifyPassword(
  plaintextPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintextPassword, passwordHash);
}
