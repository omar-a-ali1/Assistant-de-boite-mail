/**
 * Mail controller: per-user Gmail status and synchronization.
 *
 * @module controllers/mail.controller
 */
const userModel = require('../models/user.model');
const syncModel = require('../models/sync.model');
const mailService = require('../services/mail.service');
const { encryptSecret } = require('../utils/credentials');
const logger = require('../utils/logger');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

async function status(req, res, next) {
  try {
    const user = await userModel.findById(req.session.userId);
    if (!user) throw new AppError(HTTP_REQUESTS[401].code, 'Authentication is required.', 401);
    const state = await syncModel.getState(user.id);
    res.json({
      data: {
        mailbox: user.mailbox_address,
        gmailConnected: Boolean(user.gmail_app_password_encrypted),
        verifiedAt: user.gmail_verified_at,
        lastSyncAt: state?.last_sync_at || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function sync(req, res, next) {
  try {
    const user = await userModel.findById(req.session.userId);
    if (!user) throw new AppError(HTTP_REQUESTS[401].code, 'Authentication is required.', 401);
    const result = await mailService.syncUserMailbox(user);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function connect(req, res, next) {
  try {
    const user = await userModel.findById(req.session.userId);
    if (!user) throw new AppError(HTTP_REQUESTS[401].code, 'Authentication is required.', 401);
    if (!mailService.isGmailAddress(user.email)) {
      throw new AppError(
        'GMAIL_ACCOUNT_REQUIRED',
        'This account is not a Gmail address. Create a Gmail-based account to connect a mailbox.',
        400
      );
    }

    const { gmailAppPassword } = req.validatedBody;
    await mailService.verifyGmailCredentials(user.email, gmailAppPassword);
    const encrypted = encryptSecret(mailService.normalizeAppPassword(gmailAppPassword));
    const updated = await userModel.updateGmailCredentials(user.id, {
      mailboxAddress: user.email,
      gmailAppPasswordEncrypted: encrypted,
      gmailVerifiedAt: new Date(),
    });

    req.session.gmailConnected = true;
    req.session.mailboxAddress = updated.mailbox_address;

    let initialSync = null;
    try {
      initialSync = await mailService.syncUserMailbox(updated, { limit: 25 });
    } catch (err) {
      logger.warn('gmail_connect_initial_sync_failed', {
        userId: user.id,
        code: err.code || 'GMAIL_SYNC_FAILED',
      });
      initialSync = { imported: 0, skipped: 0, classified: 0, error: err.code || 'GMAIL_SYNC_FAILED' };
    }

    res.json({
      data: {
        mailbox: updated.mailbox_address,
        gmailConnected: true,
        verifiedAt: updated.gmail_verified_at,
        initialSync,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { status, sync, connect };
