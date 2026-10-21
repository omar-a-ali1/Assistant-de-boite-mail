/**
 * Auth controller: register / login / logout / me.
 *
 * @module controllers/auth.controller
 */
const crypto = require('node:crypto');
const authService = require('../services/auth.service');
const mailService = require('../services/mail.service');
const userModel = require('../models/user.model');
const { encryptSecret } = require('../utils/credentials');
const AppError = require('../lib/errors/AppError');
const logger = require('../utils/logger');
const { HTTP_REQUESTS } = require('../config/system');

function safeUser(session) {
  return {
    id: session.userId,
    email: session.email,
    displayName: session.displayName,
    mailboxAddress: session.mailboxAddress || session.email,
    gmailConnected: Boolean(session.gmailConnected),
  };
}

/**
 * Regenerate the session id (prevents fixation) and attach the user + CSRF
 * token. Shared by login and registration so both flows behave identically.
 */
function establishSession(req, res, next, user, status, extra = {}) {
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.displayName = user.displayName;
    req.session.mailboxAddress = user.mailboxAddress || user.email;
    req.session.gmailConnected = Boolean(user.gmailConnected);
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save((saveErr) => {
      if (saveErr) return next(saveErr);
      res.status(status).json({ data: { user: safeUser(req.session), csrfToken: req.session.csrfToken, ...extra } });
    });
  });
}

async function register(req, res, next) {
  try {
    const { email, password, displayName, gmailAppPassword } = req.validatedBody;

    await mailService.verifyGmailCredentials(email, gmailAppPassword);
    const encrypted = encryptSecret(mailService.normalizeAppPassword(gmailAppPassword));

    const user = await authService.createUser({
      email,
      password,
      displayName,
      mailboxAddress: email,
      gmailAppPasswordEncrypted: encrypted,
      gmailVerifiedAt: new Date(),
    });

    // Import the real inbox before returning so the new account is usable
    // immediately. A transient sync failure must not discard a valid account.
    let initialSync = null;
    try {
      const fullUser = await userModel.findById(user.id);
      initialSync = await mailService.syncUserMailbox(fullUser, { limit: 25 });
    } catch (err) {
      logger.warn('registration_initial_sync_failed', {
        userId: user.id,
        code: err.code || 'GMAIL_SYNC_FAILED',
      });
      initialSync = {
        mailbox: email,
        imported: 0,
        skipped: 0,
        classified: 0,
        error: err.code || 'GMAIL_SYNC_FAILED',
      };
    }

    establishSession(req, res, next, user, 201, { initialSync });
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

async function me(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      throw new AppError(HTTP_REQUESTS[401].code, 'Authentication is required.', 401);
    }
    if (!req.session.csrfToken) {
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    // Refresh mailbox state from the database so a reconnected or revoked
    // mailbox is reflected without requiring a new login.
    const user = await userModel.findById(req.session.userId);
    if (user) {
      req.session.mailboxAddress = user.mailbox_address;
      req.session.gmailConnected = Boolean(user.gmail_app_password_encrypted);
    }
    res.json({ data: { user: safeUser(req.session), csrfToken: req.session.csrfToken } });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, logout, me };
