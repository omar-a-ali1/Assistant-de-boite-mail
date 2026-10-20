/**
 * Auth controller: login / logout / me.
 *
 * @module controllers/auth.controller
 */
const authService = require('../services/auth.service');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

function safeUser(session) {
  return { id: session.userId, email: session.email, displayName: session.displayName };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.validatedBody;
    const user = await authService.authenticate(email, password);
    // Regenerate the session id to prevent fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      req.session.email = user.email;
      req.session.displayName = user.displayName;
      req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.json({ data: { user, csrfToken: req.session.csrfToken } });
      });
    });
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
    req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
  }
  res.json({ data: { user: safeUser(req.session), csrfToken: req.session.csrfToken } });
}

module.exports = { login, logout, me };
