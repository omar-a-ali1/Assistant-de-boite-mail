/**
 * Auth controller: register / login / logout / me.
 *
 * @module controllers/auth.controller
 */
const crypto = require('node:crypto');
const authService = require('../services/auth.service');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

function safeUser(session) {
  return { id: session.userId, email: session.email, displayName: session.displayName };
}

/**
 * Regenerate the session id (prevents fixation) and attach the user + CSRF
 * token. Shared by login and registration so both flows behave identically.
 */
function establishSession(req, res, next, user, status) {
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.status(status).json({ data: { user, csrfToken: req.session.csrfToken } });
    });
  });
}

async function register(req, res, next) {
  try {
    const { email, password, displayName } = req.validatedBody;
    const user = await authService.createUser({ email, password, displayName });
    establishSession(req, res, next, user, 201);
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.validatedBody;
    const user = await authService.authenticate(email, password);
    establishSession(req, res, next, user, 200);
  } catch (err) {
    next(err);
  }
}

function logout(req, res, next) {
  if (!req.session) return res.json({ data: { ok: true } });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(require('../config/env').session.cookieName);
    res.json({ data: { ok: true } });
  });
}

function me(req, res, next) {
  if (!req.session || !req.session.userId) {
    return next(new AppError(HTTP_REQUESTS[401].code, 'Authentication is required.', 401));
  }
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.json({ data: { user: safeUser(req.session), csrfToken: req.session.csrfToken } });
}

module.exports = { register, login, logout, me };
