/**
 * Parameterized SQL for `sync_state` and `sync_runs`, scoped per user.
 *
 * @module models/sync.model
 */
const { query } = require('../config/db');

async function getState(userId) {
  const { rows } = await query(
    `SELECT id, user_id, mailbox_address, cursor, cursor_updated_at, last_sync_at, created_at, updated_at
     FROM sync_state WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/** Advance the durable cursor (only after a batch is committed). */
async function advanceCursor({ client, userId, mailbox, cursor }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO sync_state (user_id, mailbox_address, cursor, cursor_updated_at, last_sync_at)
     VALUES ($1, $2, $3, now(), now())
     ON CONFLICT (user_id)
     DO UPDATE SET cursor = EXCLUDED.cursor, cursor_updated_at = now(), last_sync_at = now(), updated_at = now()
     RETURNING id, cursor, cursor_updated_at, last_sync_at`,
    [userId, mailbox, cursor]
  );
  return rows[0];
}

async function startRun({ client, userId, mailbox, cursorStart, executionId }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO sync_runs (user_id, mailbox_address, status, cursor_start, execution_id)
     VALUES ($1, $2, 'RUNNING', $3, $4)
     RETURNING id, status, cursor_start, started_at`,
    [userId, mailbox, cursorStart || null, executionId || null]
  );
  return rows[0];
}

async function finishRun(id, { status, cursorEnd, importedCount, updatedCount, skippedCount, failedCount, errorCode, errorMessage }, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `UPDATE sync_runs
     SET status = $2, cursor_end = $3, imported_count = $4, updated_count = $5,
         skipped_count = $6, failed_count = $7, error_code = $8, error_message = $9,
         completed_at = now(), updated_at = now()
     WHERE id = $1
     RETURNING id, status, cursor_end, imported_count, updated_count, skipped_count, failed_count, completed_at`,
    [id, status, cursorEnd || null, importedCount || 0, updatedCount || 0, skippedCount || 0, failedCount || 0, errorCode || null, errorMessage || null]
  );
  return rows[0] || null;
}

module.exports = { getState, advanceCursor, startRun, finishRun };
