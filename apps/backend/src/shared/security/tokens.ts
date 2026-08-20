import { randomBytes, createHash } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { UnauthorizedError } from '../errors/AppError.js';

/**
 * Short-lived, signed access tokens (JWT). Carried in the Authorization
 * header, never persisted server-side, never stored in a cookie.
 */
export function signAccessToken(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): string {
  return jwt.sign(payload, secret, { expiresIn: ttlSeconds });
}

export function verifyAccessToken<T extends Record<string, unknown>>(
  token: string,
  secret: string,
): T {
  try {
    return jwt.verify(token, secret) as T;
  } catch {
    // Deliberately generic — never reveal whether the token was malformed,
    // expired, or had a bad signature. See security-measures.md §30.
    throw new UnauthorizedError('Invalid or expired access token.');
  }
}

/**
 * Long-lived opaque tokens (refresh tokens, password reset tokens). The
 * plaintext value is returned to the client exactly once and is never
 * stored — only its SHA-256 hash is persisted, so a database leak alone
 * does not let an attacker use the tokens. See security-measures.md §2/§1.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
