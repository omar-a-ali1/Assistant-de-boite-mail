/**
 * Parameterized SQL for the `users` table.
 *
 * @module models/user.model
 */
const { query } = require('../config/db');

async function findByEmail(email) {
  const { rows } = await query(
    `SELECT id, email, password_hash, display_name, mailbox_address,
            gmail_app_password_encrypted, gmail_verified_at, created_at, updated_at
     FROM users
     WHERE normalize_email(email) = normalize_email($1)
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query(
    `SELECT id, email, display_name, mailbox_address,
            gmail_app_password_encrypted, gmail_verified_at, created_at, updated_at
     FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByMailbox(mailbox) {
  const { rows } = await query(
    `SELECT id, email, display_name, mailbox_address,
            gmail_app_password_encrypted, gmail_verified_at, created_at, updated_at
     FROM users
     WHERE normalize_email(mailbox_address) = normalize_email($1)
     LIMIT 1`,
    [mailbox]
  );
  return rows[0] || null;
}

async function insert({
  email,
  passwordHash,
  displayName,
  mailboxAddress,
  gmailAppPasswordEncrypted,
  gmailVerifiedAt,
}) {
  const { rows } = await query(
    `INSERT INTO users (
       email, password_hash, display_name, mailbox_address,
       gmail_app_password_encrypted, gmail_verified_at
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, display_name, mailbox_address, gmail_verified_at, created_at, updated_at`,
    [
      email,
      passwordHash,
      displayName,
      mailboxAddress || email,
      gmailAppPasswordEncrypted || null,
      gmailVerifiedAt || null,
    ]
  );
  return rows[0];
}

async function updateGmailCredentials(id, { mailboxAddress, gmailAppPasswordEncrypted, gmailVerifiedAt }) {
  const { rows } = await query(
    `UPDATE users
     SET mailbox_address = $2,
         gmail_app_password_encrypted = $3,
         gmail_verified_at = $4,
         updated_at = now()
     WHERE id = $1
     RETURNING id, email, display_name, mailbox_address, gmail_verified_at, created_at, updated_at`,
    [id, mailboxAddress, gmailAppPasswordEncrypted, gmailVerifiedAt]
  );
  return rows[0] || null;
}

module.exports = { findByEmail, findById, findByMailbox, insert, updateGmailCredentials };
