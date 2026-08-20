import { beforeEach, describe, expect, it } from 'vitest';

import { createAuthService } from '../authService.js';
import {
  createInMemoryCompanyRepo,
  createInMemoryResetTokenRepo,
  createInMemorySessionRepo,
  createInMemoryUserRepo,
} from './inMemoryPorts.js';

function buildService() {
  return createAuthService({
    companyRepo: createInMemoryCompanyRepo(),
    userRepo: createInMemoryUserRepo(),
    sessionRepo: createInMemorySessionRepo(),
    resetTokenRepo: createInMemoryResetTokenRepo(),
  });
}

const validRegisterInput = {
  companyName: 'Studio Oslo',
  slug: 'studio-oslo',
  timezone: 'Europe/Oslo',
  currency: 'NOK',
  email: 'owner@example.com',
  password: 'correct-horse-battery-staple',
  ownerName: 'Jane Owner',
};

describe('authService.registerCompanyAndOwner', () => {
  let service: ReturnType<typeof buildService>;

  beforeEach(() => {
    service = buildService();
  });

  it('creates a company and an owner user, and logs them in', async () => {
    const result = await service.registerCompanyAndOwner(validRegisterInput);

    expect(result.user.email).toBe('owner@example.com');
    expect(result.user.role).toBe('owner');
    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it('rejects a duplicate slug', async () => {
    await service.registerCompanyAndOwner(validRegisterInput);

    await expect(
      service.registerCompanyAndOwner({ ...validRegisterInput, email: 'other@example.com' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a duplicate email', async () => {
    await service.registerCompanyAndOwner(validRegisterInput);

    await expect(
      service.registerCompanyAndOwner({ ...validRegisterInput, slug: 'other-slug' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('authService.login', () => {
  let service: ReturnType<typeof buildService>;

  beforeEach(async () => {
    service = buildService();
    await service.registerCompanyAndOwner(validRegisterInput);
  });

  it('succeeds with the correct password', async () => {
    const result = await service.login({
      email: validRegisterInput.email,
      password: validRegisterInput.password,
    });
    expect(result.user.email).toBe(validRegisterInput.email);
  });

  it('rejects an incorrect password with a generic message', async () => {
    await expect(
      service.login({ email: validRegisterInput.email, password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', publicMessage: 'Invalid email or password.' });
  });

  it('rejects a non-existent email with the SAME generic message (no enumeration)', async () => {
    await expect(
      service.login({ email: 'nobody@example.com', password: 'whatever12345' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', publicMessage: 'Invalid email or password.' });
  });
});

describe('authService.refresh — rotation and reuse detection', () => {
  let service: ReturnType<typeof buildService>;
  let firstRefreshToken: string;

  beforeEach(async () => {
    service = buildService();
    const registration = await service.registerCompanyAndOwner(validRegisterInput);
    firstRefreshToken = registration.refreshToken;
  });

  it('issues a new access token and a NEW refresh token on refresh', async () => {
    const result = await service.refresh({ refreshToken: firstRefreshToken });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken).not.toBe(firstRefreshToken);
  });

  it('rejects the old refresh token after it has been rotated', async () => {
    await service.refresh({ refreshToken: firstRefreshToken });

    await expect(service.refresh({ refreshToken: firstRefreshToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('revokes the ENTIRE session family when a rotated-out token is reused', async () => {
    const { refreshToken: secondToken } = await service.refresh({
      refreshToken: firstRefreshToken,
    });

    // Reusing the already-rotated first token is treated as theft/replay.
    await expect(service.refresh({ refreshToken: firstRefreshToken })).rejects.toThrow(
      /reused refresh token/i,
    );

    // The legitimate, still-fresh second token must ALSO now be dead —
    // this is the "revoke the whole family" guarantee, not just the
    // specific reused token.
    await expect(service.refresh({ refreshToken: secondToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects an unknown/garbage refresh token', async () => {
    await expect(service.refresh({ refreshToken: 'not-a-real-token' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('authService.logout / logoutAll', () => {
  let service: ReturnType<typeof buildService>;

  beforeEach(() => {
    service = buildService();
  });

  it('logout revokes that session — subsequent refresh fails', async () => {
    const { refreshToken } = await service.registerCompanyAndOwner(validRegisterInput);

    await service.logout({ refreshToken });

    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('logout is idempotent — logging out twice does not throw', async () => {
    const { refreshToken } = await service.registerCompanyAndOwner(validRegisterInput);

    await service.logout({ refreshToken });
    await expect(service.logout({ refreshToken })).resolves.toBeUndefined();
  });

  it('logoutAll revokes every session for the user, not just one', async () => {
    const { user, refreshToken: sessionA } =
      await service.registerCompanyAndOwner(validRegisterInput);
    const { refreshToken: sessionB } = await service.login({
      email: validRegisterInput.email,
      password: validRegisterInput.password,
    });

    await service.logoutAll({ userId: user.id });

    await expect(service.refresh({ refreshToken: sessionA })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(service.refresh({ refreshToken: sessionB })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('authService.forgotPassword / resetPassword', () => {
  let service: ReturnType<typeof buildService>;

  beforeEach(async () => {
    service = buildService();
    await service.registerCompanyAndOwner(validRegisterInput);
  });

  it('returns a reset token for an existing email', async () => {
    const result = await service.forgotPassword({ email: validRegisterInput.email });
    expect(result.devOnlyResetToken).toEqual(expect.any(String));
  });

  it('returns no token for a non-existent email (but does not throw)', async () => {
    const result = await service.forgotPassword({ email: 'nobody@example.com' });
    expect(result.devOnlyResetToken).toBeUndefined();
  });

  it('resets the password and invalidates existing sessions', async () => {
    const { refreshToken: oldSession } = await service.login({
      email: validRegisterInput.email,
      password: validRegisterInput.password,
    });
    const { devOnlyResetToken } = await service.forgotPassword({
      email: validRegisterInput.email,
    });

    await service.resetPassword({
      token: devOnlyResetToken as string,
      newPassword: 'a-brand-new-password-123',
    });

    // Old password no longer works.
    await expect(
      service.login({ email: validRegisterInput.email, password: validRegisterInput.password }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    // New password works.
    await expect(
      service.login({ email: validRegisterInput.email, password: 'a-brand-new-password-123' }),
    ).resolves.toMatchObject({ user: { email: validRegisterInput.email } });

    // Sessions created before the reset are invalidated.
    await expect(service.refresh({ refreshToken: oldSession })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects reuse of an already-used reset token', async () => {
    const { devOnlyResetToken } = await service.forgotPassword({
      email: validRegisterInput.email,
    });

    await service.resetPassword({
      token: devOnlyResetToken as string,
      newPassword: 'first-new-password-123',
    });

    await expect(
      service.resetPassword({
        token: devOnlyResetToken as string,
        newPassword: 'second-new-password-456',
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects an unknown reset token', async () => {
    await expect(
      service.resetPassword({ token: 'not-a-real-token', newPassword: 'whatever-new-123' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
