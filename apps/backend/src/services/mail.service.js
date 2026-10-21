/**
 * Per-user Gmail access using an App Password.
 *
 * Gmail has no public "does this account exist" endpoint, so successful
 * IMAP and SMTP authentication is the verification: it proves the mailbox
 * exists and that the App Password is valid.
 *
 * @module services/mail.service
 */
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const config = require('../config/env');
const emailModel = require('../models/email.model');
const syncModel = require('../models/sync.model');
const importService = require('./import.service');
const aiService = require('./ai.service');
const { decryptSecret } = require('../utils/credentials');
const { APP_PASSWORD_MIN_LENGTH, APP_PASSWORD_MAX_LENGTH } = require('../config/system');
const AppError = require('../lib/errors/AppError');
const logger = require('../utils/logger');

const IMAP_HOST = 'imap.gmail.com';
const IMAP_PORT = 993;
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

function isGmailAddress(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized.endsWith('@gmail.com') || normalized.endsWith('@googlemail.com');
}

function normalizeAppPassword(value) {
  return String(value || '').replace(/\s+/g, '');
}

function imapClient(email, appPassword) {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    tls: { minVersion: 'TLSv1.2' },
  });
}

function smtpTransport(email, appPassword) {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: email, pass: appPassword },
  });
}

async function checkImap(email, appPassword) {
  const client = imapClient(email, appPassword);
  try {
    await client.connect();
  } finally {
    await client.logout().catch(() => {});
  }
}

async function checkSmtp(email, appPassword) {
  const transport = smtpTransport(email, appPassword);
  await transport.verify();
  transport.close();
}

/**
 * Validate Gmail App Password credentials against both IMAP and SMTP.
 * Throws a stable 422 error without leaking provider details.
 */
async function verifyGmailCredentials(email, appPassword) {
  if (!isGmailAddress(email)) {
    throw new AppError(
      'GMAIL_ACCOUNT_REQUIRED',
      'Only Gmail accounts can be connected. Use an @gmail.com address.',
      400
    );
  }
  const password = normalizeAppPassword(appPassword);
  if (
    password.length < APP_PASSWORD_MIN_LENGTH ||
    password.length > APP_PASSWORD_MAX_LENGTH ||
    !/^[A-Za-z0-9]+$/.test(password)
  ) {
    throw new AppError(
      'GMAIL_APP_PASSWORD_INVALID',
      `A Gmail App Password must contain ${APP_PASSWORD_MIN_LENGTH}-${APP_PASSWORD_MAX_LENGTH} letters or digits.`,
      400
    );
  }

  try {
    await Promise.all([checkImap(email, password), checkSmtp(email, password)]);
  } catch (err) {
    logger.warn('gmail_verification_failed', { code: err.code || err.responseCode || 'AUTH' });
    throw new AppError(
      'GMAIL_AUTH_FAILED',
      'Gmail authentication failed. Check the address and the App Password.',
      422
    );
  }
}

function getCredentials(user) {
  if (!user || !user.gmail_app_password_encrypted) {
    throw new AppError(
      'GMAIL_NOT_CONNECTED',
      'No Gmail account is connected to this account.',
      409
    );
  }
  const appPassword = decryptSecret(user.gmail_app_password_encrypted);
  if (!appPassword) {
    throw new AppError(
      'GMAIL_CREDENTIALS_UNREADABLE',
      'Stored Gmail credentials cannot be read. Reconnect the mailbox.',
      409
    );
  }
  return { email: user.mailbox_address || user.email, appPassword };
}

function referencesOf(parsed) {
  const refs = parsed.references;
  if (Array.isArray(refs)) return refs.filter(Boolean);
  if (typeof refs === 'string' && refs.trim()) return refs.split(/\s+/).filter(Boolean);
  return [];
}

function recipientsOf(parsed) {
  const groups = [parsed.to, parsed.cc, parsed.bcc].filter(Boolean);
  const addresses = [];
  for (const group of groups) {
    for (const entry of group.value || []) {
      if (entry.address) addresses.push(entry.address);
    }
  }
  return addresses;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function toImportMessage(parsed, uid) {
  const messageId = parsed.messageId || `imap-${uid}`;
  const references = referencesOf(parsed);
  const inReplyTo =
    typeof parsed.inReplyTo === 'string' && parsed.inReplyTo.trim()
      ? parsed.inReplyTo.trim()
      : null;
  const threadId = references[0] || inReplyTo || messageId;
  return {
    gmailMessageId: messageId,
    gmailThreadId: threadId,
    sender:
      parsed.from?.value?.[0]?.address || parsed.from?.text || 'expéditeur inconnu',
    recipients: recipientsOf(parsed),
    subject: parsed.subject || '(sans objet)',
    bodyText: parsed.text || htmlToText(parsed.html) || '',
    receivedAt: (parsed.date || new Date()).toISOString(),
    uid,
    messageId,
    references,
  };
}

/** Fetch and parse the newest messages from Gmail INBOX. */
async function fetchRecentMessages(email, appPassword, limit) {
  const client = imapClient(email, appPassword);
  const messages = [];
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const exists = client.mailbox?.exists || 0;
    if (!exists) return [];
    const uids = await client.search({ all: true }, { uid: true });
    const selected = uids.slice(-Math.min(limit, 500));
    for await (const raw of client.fetch(selected, { source: true, uid: true }, { uid: true })) {
      if (!raw.source) continue;
      const parsed = await simpleParser(raw.source);
      messages.push(toImportMessage(parsed, raw.uid));
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return messages;
}

/** Classify a bounded batch of this user's unclassified messages. */
async function classifyPending(userId, limit = 20) {
  const pending = await emailModel.findUnclassified({ userId, limit });
  let classified = 0;
  for (const email of pending) {
    try {
      const result = await aiService.generateClassification({
        subject: email.subject,
        body: email.body_text,
        sender: email.sender,
      });
      await emailModel.updateClassification(email.id, result);
      classified += 1;
    } catch (err) {
      logger.warn('mail_classification_failed', { emailId: email.id, code: err.code || 'AI' });
    }
  }
  return classified;
}

/**
 * Synchronize one user's Gmail INBOX into the local database.
 * Returns counters plus the classified subset.
 */
async function syncUserMailbox(user, { limit = config.mail.syncLimit } = {}) {
  const { email, appPassword } = getCredentials(user);
  const state = await syncModel.getState(user.id);
  const cursorStart = state?.cursor || null;
  const run = await syncModel.startRun({ userId: user.id, mailbox: email, cursorStart });

  try {
    const messages = await fetchRecentMessages(email, appPassword, limit);
    const maxUid = messages.reduce((max, m) => Math.max(max, Number(m.uid) || 0), 0);
    const cursor = maxUid ? String(maxUid) : cursorStart;
    const imported = messages.length
      ? await importService.importBatch({
          userId: user.id,
          mailbox: email,
          cursor,
          messages,
        })
      : { imported: 0, skipped: 0 };
    const classified = await classifyPending(user.id, 20);

    await syncModel.finishRun(run.id, {
      status: 'SUCCESS',
      cursorEnd: cursor,
      importedCount: imported.imported,
      skippedCount: imported.skipped,
      failedCount: 0,
    });

    logger.info('gmail_sync_completed', {
      userId: user.id,
      imported: imported.imported,
      skipped: imported.skipped,
      classified,
    });

    return {
      mailbox: email,
      imported: imported.imported,
      skipped: imported.skipped,
      classified,
      fetched: messages.length,
      cursor,
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    await syncModel.finishRun(run.id, {
      status: 'FAILED',
      errorCode: err.code || 'GMAIL_SYNC_FAILED',
      errorMessage: 'Gmail synchronization failed.',
      failedCount: 1,
    });
    logger.warn('gmail_sync_failed', { userId: user.id, code: err.code || err.responseCode || 'IMAP' });
    if (err instanceof AppError) throw err;
    throw new AppError(
      'GMAIL_SYNC_FAILED',
      'Gmail synchronization failed. Reconnect the mailbox or retry later.',
      502
    );
  }
}

/** Send a reply through the user's Gmail SMTP account. */
async function sendGmailReply(user, { to, subject, body, inReplyTo, references }) {
  const { email, appPassword } = getCredentials(user);
  const transport = smtpTransport(email, appPassword);
  try {
    const info = await transport.sendMail({
      from: email,
      to,
      subject: /^re\s*:/i.test(subject || '') ? subject : `Re: ${subject || '(sans objet)'}`,
      text: body,
      inReplyTo: inReplyTo || undefined,
      references: references && references.length ? references : inReplyTo ? [inReplyTo] : undefined,
    });
    return { providerMessageId: info.messageId || null };
  } catch (err) {
    logger.warn('gmail_send_failed', { code: err.code || err.responseCode || 'SMTP' });
    const ambiguous = ['ETIMEDOUT', 'ECONNRESET', 'ESOCKET', 'ECONNECTION'].includes(err.code);
    const error = new AppError(
      ambiguous ? 'GMAIL_SEND_UNCERTAIN' : 'GMAIL_SEND_FAILED',
      ambiguous
        ? 'The SMTP connection failed after dispatch; delivery is unknown.'
        : 'Gmail did not accept the reply.',
      502
    );
    error.ambiguous = ambiguous;
    throw error;
  } finally {
    transport.close();
  }
}

module.exports = {
  isGmailAddress,
  normalizeAppPassword,
  verifyGmailCredentials,
  syncUserMailbox,
  sendGmailReply,
  classifyPending,
  getCredentials,
};
