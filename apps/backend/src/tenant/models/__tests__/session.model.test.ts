import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { SessionModel } from '../session.model.js';

function buildValidSession(overrides: Record<string, unknown> = {}) {
  return new SessionModel({
    userId: new Types.ObjectId(),
    companyId: new Types.ObjectId(),
    refreshTokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    ...overrides,
  });
}

describe('SessionModel validation', () => {
  it('accepts a well-formed session', () => {
    const session = buildValidSession();
    expect(session.validateSync()).toBeUndefined();
  });

  it('requires userId', () => {
    const session = buildValidSession({ userId: undefined });
    expect(session.validateSync()?.errors.userId).toBeDefined();
  });

  it('requires companyId', () => {
    const session = buildValidSession({ companyId: undefined });
    expect(session.validateSync()?.errors.companyId).toBeDefined();
  });

  it('requires refreshTokenHash', () => {
    const session = buildValidSession({ refreshTokenHash: undefined });
    expect(session.validateSync()?.errors.refreshTokenHash).toBeDefined();
  });

  it('requires expiresAt', () => {
    const session = buildValidSession({ expiresAt: undefined });
    expect(session.validateSync()?.errors.expiresAt).toBeDefined();
  });

  it('is unrevoked by default (revokedAt unset)', () => {
    const session = buildValidSession();
    expect(session.revokedAt).toBeUndefined();
  });
});
