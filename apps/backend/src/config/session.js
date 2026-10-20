/**
 * Server-side session configuration backed by PostgreSQL
 * (connect-pg-simple). Cookie is HttpOnly, SameSite=Lax, and Secure in
 * production. Session IDs are never logged.
 *
 * @module config/session
 */
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const config = require('./env');
const { pool } = require('./db');

const PgStore = connectPgSimple(session);

const store = new PgStore({
  pool,
  tableName: 'sessions',
  createTableIfMissing: false, // table is created by SQL migrations
  schemaName: 'public',
});

/**
 * @returns {import('express-session').SessionOptions}
 */
function sessionOptions() {
  return {
    store,
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  };
}

module.exports = { sessionOptions, store };
