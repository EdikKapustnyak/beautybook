import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { AdminSessionModel } from '../adminSession.model.js';

function buildValidSession(overrides: Record<string, unknown> = {}) {
  return new AdminSessionModel({
    adminUserId: new Types.ObjectId(),
    refreshTokenHash: 'c'.repeat(64),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    ...overrides,
  });
}

describe('AdminSessionModel validation', () => {
  it('accepts a well-formed session', () => {
    const session = buildValidSession();
    expect(session.validateSync()).toBeUndefined();
  });

  it('requires adminUserId', () => {
    const session = buildValidSession({ adminUserId: undefined });
    expect(session.validateSync()?.errors.adminUserId).toBeDefined();
  });

  it('requires refreshTokenHash', () => {
    const session = buildValidSession({ refreshTokenHash: undefined });
    expect(session.validateSync()?.errors.refreshTokenHash).toBeDefined();
  });

  it('is unrevoked by default', () => {
    const session = buildValidSession();
    expect(session.revokedAt).toBeUndefined();
  });
});
