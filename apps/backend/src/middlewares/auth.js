/**
 * Auth middleware: require an authenticated session, plus CSRF protection
 * for state-changing requests (signed double-submit token).
 *
 * @module middlewares/auth
 */
const crypto = require('node:crypto');
const AppError = require('../lib/errors/AppError');

/** Reject anonymous access to private routes. */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return next(new AppError('UNAUTHORIZED', 'Authentication is required.', 401));
  }
  next();
}

/** Attach a CSRF token to the session and expose it to the client. */
function issueCsrfToken(req, res, next) {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
}

/**
 * Verify the CSRF token on unsafe methods using a timing-safe comparison.
 * The token is issued via GET /auth/me and echoed in `X-CSRF-Token`.
 */
function requireCsrf(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) return next();

  // Login establishes the session and issues the token; it is not yet
  // CSRF-protected (no authenticated session exists to abuse).
  if (req.path === '/auth/login') return next();

  const expected = req.session && req.session.csrfToken;
  const provided = req.get('X-CSRF-Token') || '';

  if (!expected || !provided) {
    return next(new AppError('CSRF', 'Missing CSRF token.', 403));
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new AppError('CSRF', 'Invalid CSRF token.', 403));
  }
  next();
}

module.exports = { requireAuth, issueCsrfToken, requireCsrf };
