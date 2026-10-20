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
 * Create a user (used by the bootstrap CLI, not by a public endpoint).
 */
async function createUser({ email, password, displayName }) {
  const passwordHash = await hashPassword(password);
  return userModel.insert({ email, passwordHash, displayName: displayName || '' });
}

module.exports = { authenticate, createUser, hashPassword, verifyPassword };
