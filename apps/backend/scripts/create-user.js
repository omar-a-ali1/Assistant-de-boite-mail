#!/usr/bin/env node
/**
 * Bootstrap/admin CLI: create a user account.
 *
 * Users can also register from the application (`POST /api/v1/auth/register`,
 * UI at `/register`). This CLI remains useful for creating an admin/bootstrap
 * account without going through the public, rate-limited endpoint:
 *
 *   npm run create-user -- --email admin@example.com --password '...' --name 'Admin'
 *
 * Or via environment variables:
 *   BOOTSTRAP_EMAIL=... BOOTSTRAP_PASSWORD=... npm run create-user
 *
 * No default/hardcoded production password is shipped.
 */
const authService = require('../src/services/auth.service');
const userModel = require('../src/models/user.model');
const { closePool } = require('../src/config/db');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email || process.env.BOOTSTRAP_EMAIL;
  const password = args.password || process.env.BOOTSTRAP_PASSWORD;
  const displayName = args.name || process.env.BOOTSTRAP_NAME || '';

  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: npm run create-user -- --email <email> --password <password> [--name <name>]\n' +
        '   or: BOOTSTRAP_EMAIL=... BOOTSTRAP_PASSWORD=... npm run create-user'
    );
    process.exit(1);
  }
  if (password.length < 8) {
    // eslint-disable-next-line no-console
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = await userModel.findByEmail(email);
  if (existing) {
    // eslint-disable-next-line no-console
    console.error(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  const user = await authService.createUser({ email, password, displayName });
  // eslint-disable-next-line no-console
  console.log(`Created user ${user.email} (id=${user.id}).`);
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`create-user failed: ${err.message}`);
    closePool().finally(() => process.exit(1));
  });
