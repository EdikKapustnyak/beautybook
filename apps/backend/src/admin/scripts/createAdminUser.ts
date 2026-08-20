/**
 * One-off CLI script to create a platform admin account.
 *
 * There is deliberately no public HTTP registration endpoint for admin
 * accounts (see beautybook-security-measures.md §2/§4) — this is the only
 * sanctioned way to create one.
 *
 * Usage:
 *   npx tsx src/admin/scripts/createAdminUser.ts --email you@company.com --name "Your Name" --password "..."
 */
import { connectDB, disconnectDB } from '../../db/connection.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../shared/security/password.js';
import { adminUserRepository } from '../repositories/adminUserRepository.js';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const flagIndex = process.argv.indexOf(`--${name}`);
  if (flagIndex !== -1) {
    return process.argv[flagIndex + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  const email = readArg('email');
  const name = readArg('name');
  const password = readArg('password');
  const role = readArg('role') === 'support' ? 'support' : 'superadmin';

  if (!email || !name || !password) {
    console.error(
      'Usage: tsx src/admin/scripts/createAdminUser.ts --email <email> --name <name> --password <password> [--role superadmin|support]',
    );
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  await connectDB();

  const existing = await adminUserRepository.findByEmailForLogin(email);
  if (existing) {
    console.error(`An admin user with email ${email} already exists.`);
    await disconnectDB();
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const admin = await adminUserRepository.create({ email, passwordHash, name, role });

  // eslint-disable-next-line no-console -- CLI script, stdout output is the point
  console.log(`Created admin user ${admin.email} (${admin.role}), id=${String(admin._id)}`);
  await disconnectDB();
}

main().catch((error: unknown) => {
  console.error('Failed to create admin user:', error);
  process.exit(1);
});
