/**
 * Parameterized SQL for `drafts`, always scoped to an owning user.
 *
 * @module models/draft.model
 */
const { query } = require('../config/db');

async function insert({ client, userId, threadId, originalEmailId, body, tone }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO drafts (user_id, thread_id, original_email_id, body, tone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, thread_id, original_email_id, body, tone, edited_by_user, created_at, updated_at`,
    [userId, threadId, originalEmailId, body, tone]
  );
  return rows[0];
}

async function findById(id, userId) {
  const { rows } = await query(
    `SELECT id, user_id, thread_id, original_email_id, body, tone, edited_by_user, created_at, updated_at
     FROM drafts WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [id, userId]
  );
  return rows[0] || null;
}

async function findByThreadId(threadId, userId) {
  const { rows } = await query(
    `SELECT id, thread_id, original_email_id, body, tone, edited_by_user, created_at, updated_at
     FROM drafts WHERE thread_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [threadId, userId]
  );
  return rows;
}

async function updateBody(id, body, tone, userId) {
  const { rows } = await query(
    `UPDATE drafts
     SET body = $2, tone = COALESCE($3, tone), edited_by_user = true, updated_at = now()
     WHERE id = $1 AND user_id = $4
     RETURNING id, thread_id, original_email_id, body, tone, edited_by_user, updated_at`,
    [id, body, tone || null, userId]
  );
  return rows[0] || null;
}

module.exports = { insert, findById, findByThreadId, updateBody };
