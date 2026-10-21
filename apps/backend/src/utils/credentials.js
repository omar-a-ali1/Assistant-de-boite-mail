/**
 * Symmetric encryption for stored mailbox App Passwords (AES-256-GCM).
 * The key comes from MAIL_CREDENTIALS_KEY or is derived from SESSION_SECRET.
 *
 * @module utils/credentials
 */
const crypto = require('node:crypto');
const config = require('../config/env');
const logger = require('./logger');

const VERSION = 'v1';

function encryptionKey() {
  const configured = config.mail.credentialsKey;
  if (configured) {
    const decoded = /^[0-9a-f]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');
    if (decoded.length !== 32) {
      throw new Error('MAIL_CREDENTIALS_KEY must be 32 bytes (hex or base64).');
    }
    return decoded;
  }
  return crypto.createHash('sha256').update(config.session.secret).digest();
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptSecret(payload) {
  try {
    const [version, iv, tag, encrypted] = String(payload).split(':');
    if (version !== VERSION || !iv || !tag || !encrypted) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (err) {
    logger.warn('mail_credentials_decrypt_failed', { code: err.code || 'DECRYPT_ERROR' });
    return null;
  }
}

module.exports = { encryptSecret, decryptSecret };
