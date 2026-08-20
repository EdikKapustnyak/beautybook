import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { PasswordResetTokenModel } from '../passwordResetToken.model.js';

function buildValidToken(overrides: Record<string, unknown> = {}) {
  return new PasswordResetTokenModel({
    userId: new Types.ObjectId(),
    tokenHash: 'b'.repeat(64),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    ...overrides,
  });
}

describe('PasswordResetTokenModel validation', () => {
  it('accepts a well-formed token record', () => {
    const token = buildValidToken();
    expect(token.validateSync()).toBeUndefined();
  });

  it('requires userId', () => {
    const token = buildValidToken({ userId: undefined });
    expect(token.validateSync()?.errors.userId).toBeDefined();
  });

  it('requires tokenHash', () => {
    const token = buildValidToken({ tokenHash: undefined });
    expect(token.validateSync()?.errors.tokenHash).toBeDefined();
  });

  it('requires expiresAt', () => {
    const token = buildValidToken({ expiresAt: undefined });
    expect(token.validateSync()?.errors.expiresAt).toBeDefined();
  });

  it('is unused by default (usedAt unset)', () => {
    const token = buildValidToken();
    expect(token.usedAt).toBeUndefined();
  });
});
