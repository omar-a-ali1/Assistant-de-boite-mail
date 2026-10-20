/**
 * Parameterized SQL for `threads`.
 *
 * @module models/thread.model
 */
const { query } = require('../config/db');

async function findById(id) {
  const { rows } = await query(
    `SELECT id, mailbox_address, gmail_thread_id, subject, latest_message_at, created_at, updated_at
     FROM threads WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByGmailThreadId(mailbox, gmailThreadId) {
  const { rows } = await query(
    `SELECT id, mailbox_address, gmail_thread_id, subject, latest_message_at, created_at
     FROM threads
     WHERE normalize_email(mailbox_address) = normalize_email($1) AND gmail_thread_id = $2
     LIMIT 1`,
    [mailbox, gmailThreadId]
  );
  return rows[0] || null;
}

/**
 * Insert-or-get a thread by (mailbox, gmail_thread_id). Transaction-safe.
 */
async function upsert({ client, mailbox, gmailThreadId, subject, latestMessageAt }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO threads (mailbox_address, gmail_thread_id, subject, latest_message_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (normalize_email(mailbox_address), gmail_thread_id)
     DO UPDATE SET
       subject = CASE WHEN EXCLUDED.latest_message_at >= threads.latest_message_at
                      THEN EXCLUDED.subject ELSE threads.subject END,
       latest_message_at = GREATEST(threads.latest_message_at, EXCLUDED.latest_message_at),
       updated_at = now()
     RETURNING id, subject, latest_message_at`,
    [mailbox, gmailThreadId, subject, latestMessageAt]
  );
  return rows[0];
}

module.exports = { findById, findByGmailThreadId, upsert };
