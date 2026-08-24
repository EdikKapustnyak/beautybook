import { beforeEach, describe, expect, it } from 'vitest';

import { hashPassword } from '../../../shared/security/password.js';
import { createAdminAuthService } from '../adminAuthService.js';
import {
  createInMemoryAdminSessionRepo,
  createInMemoryAdminUserRepo,
  createInMemoryTokenVersionRevocationStore,
} from './inMemoryPorts.js';

const ADMIN_EMAIL = 'ops@beautybook.no';
const ADMIN_PASSWORD = 'correct-horse-battery-staple';

async function buildService() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  return createAdminAuthService({
    adminUserRepo: createInMemoryAdminUserRepo([
      {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'Ops Lead',
        role: 'superadmin',
        status: 'active',
      },
    ]),
    adminSessionRepo: createInMemoryAdminSessionRepo(),
    tokenVersionRevocationStore: createInMemoryTokenVersionRevocationStore(),
  });
}

describe('adminAuthService.login', () => {
  it('succeeds with the correct password', async () => {
    const service = await buildService();
    const result = await service.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(result.adminUser.email).toBe(ADMIN_EMAIL);
  });

  it('rejects an incorrect password with a generic message', async () => {
    const service = await buildService();
    await expect(
      service.login({ email: ADMIN_EMAIL, password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', publicMessage: 'Invalid email or password.' });
  });

  it('rejects a non-existent email with the SAME generic message', async () => {
    const service = await buildService();
    await expect(
      service.login({ email: 'nobody@beautybook.no', password: 'whatever12345' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', publicMessage: 'Invalid email or password.' });
  });
});

describe('adminAuthService.refresh — rotation and reuse detection', () => {
  it('rejects the old refresh token after rotation, and revokes the whole family on reuse', async () => {
    const service = await buildService();
    const { refreshToken: first } = await service.login({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const { refreshToken: second } = await service.refresh({ refreshToken: first });

    await expect(service.refresh({ refreshToken: first })).rejects.toThrow(/reused refresh token/i);
    // The whole session family is dead, including the otherwise-still-valid second token.
    await expect(service.refresh({ refreshToken: second })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('adminAuthService.logout / logoutAll', () => {
  let service: Awaited<ReturnType<typeof buildService>>;

  beforeEach(async () => {
    service = await buildService();
  });

  it('logout revokes that session', async () => {
    const { refreshToken } = await service.login({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    await service.logout({ refreshToken });

    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('logoutAll revokes every session for the admin user', async () => {
    const { adminUser, refreshToken: sessionA } = await service.login({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    const { refreshToken: sessionB } = await service.login({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    await service.logoutAll({ adminUserId: adminUser.id });

    await expect(service.refresh({ refreshToken: sessionA })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(service.refresh({ refreshToken: sessionB })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('adminAuthService.updateAdminRoleOrStatus', () => {
  it('changes the role, writes a revocation record, and revokes existing sessions', async () => {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const store = createInMemoryTokenVersionRevocationStore();
    const service = createAdminAuthService({
      adminUserRepo: createInMemoryAdminUserRepo([
        {
          email: ADMIN_EMAIL,
          passwordHash,
          name: 'Ops Lead',
          role: 'superadmin',
          status: 'active',
        },
      ]),
      adminSessionRepo: createInMemoryAdminSessionRepo(),
      tokenVersionRevocationStore: store,
    });

    const { adminUser, refreshToken } = await service.login({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    const updated = await service.updateAdminRoleOrStatus({
      adminUserId: adminUser.id,
      updates: { role: 'support' },
    });

    expect(updated?.role).toBe('support');
    expect(store.data.get(`token-version:admin:${adminUser.id}`)).toBe('1');
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('returns null for a nonexistent admin user rather than throwing', async () => {
    const service = await buildService();

    const result = await service.updateAdminRoleOrStatus({
      adminUserId: 'does-not-exist',
      updates: { role: 'support' },
    });

    expect(result).toBeNull();
  });
});
