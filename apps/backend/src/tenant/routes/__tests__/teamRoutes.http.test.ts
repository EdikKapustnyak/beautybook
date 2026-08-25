// apps/backend/src/tenant/routes/__tests__/teamRoutes.http.test.ts
//
// Converts the it.todo left in authService.test.ts (Round 3 finding #2 /
// HANDOFF_2.md §4 item 2) into a real integration test now that a
// team-management endpoint exists: "valid token -> updateUserRoleOrStatus
// via a real HTTP request -> replay the old token -> must be rejected —
// not just a unit test calling authService directly."
//
// Approach: real createApp(), real authController/teamController/
// authService/requireTenantAuth/requireFreshAuth — nothing above the
// database layer is mocked. Only the lowest-level Mongoose-touching
// repositories (userRepository, companyRepository, sessionRepository,
// passwordResetTokenRepository) and the Redis-backed
// tokenVersionRevocationStore singleton are replaced with in-memory
// fakes, mirroring exactly how authRepositoryAdapters.ts wires the real
// versions — so this test exercises the actual security property
// end-to-end (JWT verification, tokenVersion embedding, the Redis
// revocation check inside requireTenantAuth) rather than asserting on
// authService's internal state directly.

import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../repositories/userRepository.js', () => {
  interface FakeUser {
    _id: string;
    companyId: string;
    email: string;
    passwordHash: string;
    name: string;
    role: string;
    status: string;
    tokenVersion: number;
  }
  const users = new Map<string, FakeUser>();

  return {
    userRepository: {
      async findByEmailForLogin(email: string) {
        return [...users.values()].find((u) => u.email === email.toLowerCase().trim()) ?? null;
      },
      async findByIdInCompany(id: string, companyId: string) {
        const u = users.get(id);
        return u && u.companyId === companyId ? u : null;
      },
      async listByCompany(companyId: string) {
        return [...users.values()].filter((u) => u.companyId === companyId);
      },
      async listInCompany(companyId: string, options: { page: number; limit: number }) {
        const items = [...users.values()].filter((u) => u.companyId === companyId);
        return { items, total: items.length, page: options.page, limit: options.limit };
      },
      async createInCompany(
        companyId: string,
        data: Partial<FakeUser> & Pick<FakeUser, 'email' | 'passwordHash' | 'name' | 'role'>,
      ) {
        const record: FakeUser = {
          _id: new Types.ObjectId().toString(),
          companyId,
          status: 'active',
          tokenVersion: 0,
          ...data,
        };
        users.set(record._id, record);
        return record;
      },
      async updateByIdInCompany(
        id: string,
        companyId: string,
        updates: Partial<Pick<FakeUser, 'name'>>,
      ) {
        const u = users.get(id);
        if (!u || u.companyId !== companyId) return null;
        Object.assign(u, updates);
        return u;
      },
      async updateRoleOrStatusInCompany(
        id: string,
        companyId: string,
        updates: Partial<Pick<FakeUser, 'role' | 'status'>>,
      ) {
        const u = users.get(id);
        if (!u || u.companyId !== companyId) return null;
        Object.assign(u, updates);
        u.tokenVersion += 1;
        return u;
      },
      async updatePasswordHash(id: string, passwordHash: string) {
        const u = users.get(id);
        if (u) u.passwordHash = passwordHash;
      },
      async updateLastLoginAt(id: string, date: Date) {
        const u = users.get(id);
        if (u) (u as unknown as { lastLoginAt: Date }).lastLoginAt = date;
      },
    },
  };
});

vi.mock('../../repositories/companyRepository.js', () => {
  interface FakeCompany {
    _id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    status: string;
    bookingSettings: Record<string, unknown>;
  }
  const companies = new Map<string, FakeCompany>();

  return {
    companyRepository: {
      async create(data: Pick<FakeCompany, 'name' | 'slug' | 'timezone' | 'currency'>) {
        const record: FakeCompany = {
          _id: new Types.ObjectId().toString(),
          status: 'active',
          bookingSettings: {
            allowOnlineCancel: true,
            allowOnlineReschedule: true,
            minNoticeMinutes: 60,
            maxAdvanceBookingDays: 60,
          },
          ...data,
        };
        companies.set(record._id, record);
        return record;
      },
      async findById(companyId: string) {
        return companies.get(companyId) ?? null;
      },
      async findBySlug(slug: string) {
        return [...companies.values()].find((c) => c.slug === slug.toLowerCase().trim()) ?? null;
      },
      async slugExists(slug: string) {
        return [...companies.values()].some((c) => c.slug === slug.toLowerCase().trim());
      },
      async updateById(companyId: string, updates: Partial<FakeCompany>) {
        const c = companies.get(companyId);
        if (!c) return null;
        Object.assign(c, updates);
        return c;
      },
    },
  };
});

vi.mock('../../repositories/sessionRepository.js', () => {
  interface FakeSession {
    _id: string;
    userId: string;
    companyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    revokedAt?: Date;
    replacedBySessionId?: string;
  }
  const sessions = new Map<string, FakeSession>();

  return {
    sessionRepository: {
      async create(data: Omit<FakeSession, '_id'>) {
        const record: FakeSession = { _id: new Types.ObjectId().toString(), ...data };
        sessions.set(record._id, record);
        return record;
      },
      async findByRefreshTokenHash(hash: string) {
        return [...sessions.values()].find((s) => s.refreshTokenHash === hash) ?? null;
      },
      async revokeIfActive(sessionId: string, replacedBySessionId?: string) {
        const s = sessions.get(sessionId);
        if (!s || s.revokedAt) return false;
        s.revokedAt = new Date();
        if (replacedBySessionId) s.replacedBySessionId = replacedBySessionId;
        return true;
      },
      async revokeAllForUser(userId: string) {
        for (const s of sessions.values()) {
          if (s.userId === userId && !s.revokedAt) s.revokedAt = new Date();
        }
      },
    },
  };
});

vi.mock('../../repositories/passwordResetTokenRepository.js', () => ({
  passwordResetTokenRepository: {
    async create() {
      throw new Error('Not used by this test suite.');
    },
    async findByTokenHash() {
      return null;
    },
    async markUsedIfUnused() {
      return false;
    },
  },
}));

// The Redis-backed singleton requireTenantAuth actually imports —
// replacing it with a real store bound to an in-memory Map is what makes
// the "replay the old token" assertion below genuine: it exercises the
// SAME store instance authService.updateUserRoleOrStatus writes to.
vi.mock('../../../shared/security/tokenVersionRevocation.instance.js', async () => {
  const { createTokenVersionRevocationStore } =
    await import('../../../shared/security/tokenVersionRevocation.js');
  const data = new Map<string, string>();
  const tokenVersionRevocationStore = createTokenVersionRevocationStore({
    async set(key, value) {
      data.set(key, value);
      return 'OK';
    },
    async get(key) {
      return data.get(key) ?? null;
    },
  });
  return { tokenVersionRevocationStore };
});

import { hashPassword } from '../../../shared/security/password.js';
import { userRepository } from '../../repositories/userRepository.js';
import { createApp } from '../../../app.js';

const app = createApp();

function registerOwnerPayload(overrides: Partial<Record<string, string>> = {}) {
  return {
    companyName: 'Test Salon',
    slug: `test-salon-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    timezone: 'Europe/Oslo',
    currency: 'nok',
    email: `owner-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
    password: 'a-strong-password-123',
    ownerName: 'Owner Ownerson',
    ...overrides,
  };
}

async function registerOwner() {
  const response = await request(app)
    .post('/api/tenant/auth/register')
    .send(registerOwnerPayload());
  if (response.status !== 201) {
    throw new Error(`Register failed in test setup: ${JSON.stringify(response.body)}`);
  }
  return {
    accessToken: response.body.data.accessToken as string,
    user: response.body.data.user as { id: string; companyId: string },
  };
}

async function seedTeamMember(
  companyId: string,
  overrides: { role?: string; status?: string; password?: string } = {},
) {
  const password = overrides.password ?? 'employee-password-123';
  const passwordHash = await hashPassword(password);
  const email = `member-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const doc = await userRepository.createInCompany(companyId, {
    email,
    passwordHash,
    name: 'Team Member',
    role: (overrides.role ?? 'employee') as never,
    status: (overrides.status ?? 'active') as never,
  });
  return { id: String((doc as { _id: unknown })._id), email, password };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/tenant/team/:id — real HTTP path, stale-token security property', () => {
  it("a team member's OLD access token is rejected on the very next request after an owner changes their status", async () => {
    const { accessToken: ownerToken, user: owner } = await registerOwner();
    const member = await seedTeamMember(owner.companyId, { role: 'employee' });

    const memberLogin = await request(app)
      .post('/api/tenant/auth/login')
      .send({ email: member.email, password: member.password });
    expect(memberLogin.status).toBe(200);
    const memberOldAccessToken = memberLogin.body.data.accessToken as string;

    // Sanity check: the old token works BEFORE the change.
    const beforeChange = await request(app)
      .get('/api/tenant/auth/me')
      .set('Authorization', `Bearer ${memberOldAccessToken}`);
    expect(beforeChange.status).toBe(200);

    const patchResponse = await request(app)
      .patch(`/api/tenant/team/${member.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'disabled' });
    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body).toMatchObject({
      success: true,
      data: { user: { id: member.id, status: 'disabled' } },
    });

    // The exact property this test exists to prove: replaying the SAME
    // access token issued before the change is now rejected, without the
    // member needing to wait out the full access-token TTL.
    const afterChange = await request(app)
      .get('/api/tenant/auth/me')
      .set('Authorization', `Bearer ${memberOldAccessToken}`);
    expect(afterChange.status).toBe(401);
  });

  it('rejects a caller trying to change their own role/status (self-modification guard)', async () => {
    const { accessToken: ownerToken, user: owner } = await registerOwner();

    const response = await request(app)
      .patch(`/api/tenant/team/${owner.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'manager' });

    expect(response.status).toBe(403);
  });

  it('rejects a manager-role caller (RBAC: only owner/admin may call this route)', async () => {
    const { user: owner } = await registerOwner();
    const manager = await seedTeamMember(owner.companyId, { role: 'manager' });
    const target = await seedTeamMember(owner.companyId, { role: 'employee' });

    const managerLogin = await request(app)
      .post('/api/tenant/auth/login')
      .send({ email: manager.email, password: manager.password });
    expect(managerLogin.status).toBe(200);

    const response = await request(app)
      .patch(`/api/tenant/team/${target.id}`)
      .set('Authorization', `Bearer ${managerLogin.body.data.accessToken}`)
      .send({ role: 'admin' });

    expect(response.status).toBe(403);
  });

  it('an owner can promote another team member and the new role is reflected on their next login', async () => {
    const { accessToken: ownerToken, user: owner } = await registerOwner();
    const member = await seedTeamMember(owner.companyId, { role: 'employee' });

    const patchResponse = await request(app)
      .patch(`/api/tenant/team/${member.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'manager' });
    expect(patchResponse.status).toBe(200);

    const relogin = await request(app)
      .post('/api/tenant/auth/login')
      .send({ email: member.email, password: member.password });
    expect(relogin.status).toBe(200);
    expect(relogin.body.data.user.role).toBe('manager');
  });
});
