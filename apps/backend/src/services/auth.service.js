/**
 * Auth service: password verification, user bootstrap, session helpers.
 *
 * @module services/auth.service
 */
const bcrypt = require('bcrypt');
const userModel = require('../models/user.model');
const { HTTP_REQUESTS } = require('../config/system');
const AppError = require('../lib/errors/AppError');

const BCRYPT_ROUNDS = 10;

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Authenticate credentials. Uses a generic error for both unknown users
 * and wrong passwords (no account enumeration). Performs a dummy compare
 * when the user is missing to reduce timing signal.
 */
async function authenticate(email, password) {
  const user = await userModel.findByEmail(email);
  const dummyHash = '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  if (!user) {
    await bcrypt.compare(password, dummyHash).catch(() => {});
    throw new AppError(HTTP_REQUESTS[401].code, 'Invalid email or password.', 401);
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw new AppError(HTTP_REQUESTS[401].code, 'Invalid email or password.', 401);
  }
  return { id: user.id, email: user.email, displayName: user.display_name };
}

/**
 * Create a user. Used by the public registration endpoint and the bootstrap
 * CLI. The unique index on the normalized email is the source of truth, so a
 * concurrent duplicate is reported as a stable 409 instead of a 500.
 */
async function createUser({ email, password, displayName }) {
  const passwordHash = await hashPassword(password);
  try {
    const user = await userModel.insert({ email, passwordHash, displayName: displayName || '' });
    return { id: user.id, email: user.email, displayName: user.display_name };
  } catch (err) {
    if (err && err.code === '23505') {
      throw new AppError(
        'EMAIL_ALREADY_EXISTS',
        'An account already exists with this email.',
        409
      );
    }
    throw err;
  }
}

module.exports = { authenticate, createUser, hashPassword, verifyPassword };
