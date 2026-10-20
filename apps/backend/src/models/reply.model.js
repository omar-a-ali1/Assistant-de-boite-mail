/**
 * Parameterized SQL for `replies` (durable delivery outbox) and
 * `idempotency_records`.
 *
 * @module models/reply.model
 */
const { query } = require('../config/db');

async function findById(id) {
  const { rows } = await query(
    `SELECT id, thread_id, original_email_id, draft_id, idempotency_key, body, status,
            provider_message_id, error_code, error_message, attempt_count,
            last_attempt_at, created_at, updated_at, sent_at
     FROM replies WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByIdempotencyKey(key) {
  const { rows } = await query(
    `SELECT id, thread_id, original_email_id, draft_id, idempotency_key, body, status,
            provider_message_id, error_code, error_message, attempt_count,
            last_attempt_at, created_at, updated_at, sent_at
     FROM replies WHERE idempotency_key = $1 LIMIT 1`,
    [key]
  );
  return rows[0] || null;
}

async function findByThreadId(threadId) {
  const { rows } = await query(
    `SELECT id, thread_id, original_email_id, draft_id, body, status, provider_message_id,
            error_code, error_message, attempt_count, created_at, updated_at, sent_at
     FROM replies WHERE thread_id = $1 ORDER BY created_at DESC`,
    [threadId]
  );
  return rows;
}

async function insert({ client, threadId, originalEmailId, draftId, idempotencyKey, body }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO replies (thread_id, original_email_id, draft_id, idempotency_key, body, status)
     VALUES ($1, $2, $3, $4, $5, 'PENDING')
     RETURNING id, thread_id, original_email_id, draft_id, idempotency_key, body, status,
               attempt_count, created_at, updated_at, sent_at`,
    [threadId, originalEmailId, draftId || null, idempotencyKey, body]
  );
  return rows[0];
}

async function updateStatus(id, { status, providerMessageId, errorCode, errorMessage, incrementAttempt, client }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `UPDATE replies
     SET status = $2,
         provider_message_id = COALESCE($3, provider_message_id),
         error_code = $4,
         error_message = $5,
         attempt_count = attempt_count + CASE WHEN $6 THEN 1 ELSE 0 END,
         last_attempt_at = now(),
         sent_at = CASE WHEN $2 = 'SENT' THEN now() ELSE sent_at END,
         updated_at = now()
     WHERE id = $1
     RETURNING id, status, provider_message_id, error_code, error_message, attempt_count, sent_at, updated_at`,
    [id, status, providerMessageId || null, errorCode || null, errorMessage || null, incrementAttempt ? true : false]
  );
  return rows[0] || null;
}

// --- Idempotency records ---

async function findIdempotencyRecord(key, operationType) {
  const { rows } = await query(
    `SELECT id, idempotency_key, operation_type, resource_type, resource_id,
            request_fingerprint, status, result_reference, created_at, updated_at
     FROM idempotency_records
     WHERE idempotency_key = $1 AND operation_type = $2
     LIMIT 1`,
    [key, operationType]
  );
  return rows[0] || null;
}

async function insertIdempotencyRecord({ client, key, operationType, resourceType, resourceId, fingerprint }) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `INSERT INTO idempotency_records (idempotency_key, operation_type, resource_type, resource_id, request_fingerprint)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, idempotency_key, operation_type, resource_type, resource_id, request_fingerprint, status`,
    [key, operationType, resourceType, resourceId || null, fingerprint]
  );
  return rows[0];
}

async function updateIdempotencyRecord(key, operationType, { status, resultReference }, client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run(
    `UPDATE idempotency_records
     SET status = $3, result_reference = $4, updated_at = now()
     WHERE idempotency_key = $1 AND operation_type = $2
     RETURNING id, status, result_reference`,
    [key, operationType, status, resultReference || null]
  );
  return rows[0] || null;
}

module.exports = {
  findById,
  findByIdempotencyKey,
  findByThreadId,
  insert,
  updateStatus,
  findIdempotencyRecord,
  insertIdempotencyRecord,
  updateIdempotencyRecord,
};
