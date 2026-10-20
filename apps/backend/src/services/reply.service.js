/**
 * Reply service: the durable delivery outbox / state machine.
 *
 * Guarantees:
 *  - one logical send per idempotency key (DB unique constraint);
 *  - reuse of a key with a different payload is rejected (fingerprint);
 *  - the operation is persisted BEFORE delivery is dispatched;
 *  - ambiguous provider outcomes become UNKNOWN and block further sends
 *    until reconciled;
 *  - status transitions are idempotent.
 *
 * A DB transaction cannot commit atomically with Gmail's external send,
 * so UNKNOWN is a first-class state rather than an optimistic SENT.
 *
 * @module services/reply.service
 */
const crypto = require('node:crypto');
const { withTransaction } = require('../config/db');
const replyModel = require('../models/reply.model');
const emailModel = require('../models/email.model');
const threadModel = require('../models/thread.model');
const draftModel = require('../models/draft.model');
const auditModel = require('../models/audit.model');
const n8n = require('./n8n.service');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');
const logger = require('../utils/logger');

const OPERATION_TYPE = 'send_reply';

function fingerprint(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Submit an approved reply. Idempotent on `idempotencyKey`.
 *
 * @returns {Promise<{reply: object, reused: boolean}>}
 */
async function submitReply({ emailId, idempotencyKey, body, draftId, userId }) {
  const email = await emailModel.findById(emailId);
  if (!email) throw new AppError(HTTP_REQUESTS[404].code, 'Email not found.', 404);

  const thread = await threadModel.findById(email.thread_id);
  if (!thread) throw new AppError(HTTP_REQUESTS[404].code, 'Thread not found.', 404);

  // Resolve final body: explicit body or the saved draft.
  let finalBody = body;
  let resolvedDraftId = draftId || null;
  if (draftId) {
    const draft = await draftModel.findById(draftId);
    if (!draft) throw new AppError(HTTP_REQUESTS[404].code, 'Draft not found.', 404);
    if (draft.thread_id !== email.thread_id) {
      throw new AppError(HTTP_REQUESTS[422].code, 'Draft does not belong to this thread.', 422);
    }
    if (!finalBody) finalBody = draft.body;
    resolvedDraftId = draft.id;
  }
  if (!finalBody || !finalBody.trim()) {
    throw new AppError(HTTP_REQUESTS[400].code, 'Reply body is required.', 400);
  }

  const fp = fingerprint({ emailId, body: finalBody.trim(), draftId: resolvedDraftId });

  const { reply, reused } = await withTransaction(async (client) => {
    // Serialize concurrent requests that share the same idempotency key.
    // The transaction-scoped advisory lock guarantees only one transaction
    // can create the operation; others wait, then see the existing record.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `${OPERATION_TYPE}:${idempotencyKey}`,
    ]);

    const existingRecord = await replyModel.findIdempotencyRecord(idempotencyKey, OPERATION_TYPE);

    if (existingRecord) {
      if (existingRecord.request_fingerprint !== fp) {
        throw new AppError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used with a different request.',
          409
        );
      }
      const existingReply = await replyModel.findById(existingRecord.result_reference);
      return { reply: existingReply, reused: true };
    }

    const record = await replyModel.insertIdempotencyRecord({
      client,
      key: idempotencyKey,
      operationType: OPERATION_TYPE,
      resourceType: 'email',
      resourceId: email.id,
      fingerprint: fp,
    });

    const created = await replyModel.insert({
      client,
      threadId: email.thread_id,
      originalEmailId: email.id,
      draftId: resolvedDraftId,
      idempotencyKey,
      body: finalBody.trim(),
    });

    await replyModel.updateIdempotencyRecord(
      idempotencyKey,
      OPERATION_TYPE,
      { status: 'COMPLETED', resultReference: created.id },
      client
    );

    // Mark the source email as replied-to-in-progress.
    await emailModel.updateProcessingStatus(email.id, 'REPLIED', client);

    await auditModel.record(
      {
        eventType: 'reply_submitted',
        actor: userId || 'system',
        resourceType: 'reply',
        resourceId: created.id,
        metadata: { emailId: email.id, recordId: record.id },
      },
      client
    );

    return { reply: created, reused: false };
  });

  // Dispatch only for a freshly created operation. Never resubmit blindly.
  if (!reused) {
    await dispatch(reply, { gmailThreadId: thread.gmail_thread_id, gmailMessageId: email.gmail_message_id });
  }

  return { reply: await replyModel.findById(reply.id), reused };
}

/** Move PENDING -> SENDING and trigger the n8n send workflow. */
async function dispatch(reply, { gmailThreadId, gmailMessageId }) {
  // Only PENDING replies are eligible. Prevents duplicate dispatch.
  const current = await replyModel.findById(reply.id);
  if (!current || current.status !== 'PENDING') {
    logger.warn('reply_dispatch_skipped', { replyId: reply.id, status: current?.status });
    return;
  }

  await replyModel.updateStatus(reply.id, { status: 'SENDING', incrementAttempt: true });

  const result = await n8n.triggerSendReply({
    replyId: reply.id,
    idempotencyKey: reply.idempotency_key,
    body: reply.body,
    gmailThreadId,
    gmailMessageId,
    originalEmailId: reply.original_email_id,
    threadId: reply.thread_id,
  });

  if (result.skipped) {
    // No n8n send workflow configured (demo mode): revert to PENDING so the
    // UI honestly shows "not sent" instead of a stuck SENDING state. We never
    // fake a successful send.
    await replyModel.updateStatus(reply.id, {
      status: 'PENDING',
      errorCode: 'NO_WORKFLOW',
      errorMessage: 'The sending workflow is not configured.',
    });
    logger.info('reply_dispatch_no_workflow', { replyId: reply.id });
    return;
  }

  if (!result.ok) {
    // The request may or may not have been accepted upstream: UNKNOWN is
    // the only safe outcome when we cannot establish delivery.
    await replyModel.updateStatus(reply.id, {
      status: result.error === 'TIMEOUT' ? 'UNKNOWN' : 'FAILED',
      errorCode: result.error || `HTTP_${result.status || 'ERR'}`,
      errorMessage: 'The delivery workflow did not confirm acceptance.',
    });
  }
  // On success we wait for the workflow callback to set SENT/FAILED/UNKNOWN.
}

/** Apply a delivery outcome reported by n8n. Idempotent. */
async function applyOutcome({ replyId, status, providerMessageId, errorCode, errorMessage }) {
  const reply = await replyModel.findById(replyId);
  if (!reply) throw new AppError(HTTP_REQUESTS[404].code, 'Reply not found.', 404);

  // Idempotent: a terminal SENT stays SENT.
  if (reply.status === 'SENT' && status === 'SENT') {
    return reply;
  }

  const updated = await replyModel.updateStatus(replyId, {
    status,
    providerMessageId,
    errorCode,
    errorMessage,
  });
  logger.info('reply_outcome_applied', { replyId, status });
  return updated;
}

/**
 * Safe retry: only FAILED is retryable. UNKNOWN must be reconciled first
 * (never blindly resend a possibly-delivered message).
 */
async function retry(replyId) {
  const reply = await replyModel.findById(replyId);
  if (!reply) throw new AppError(HTTP_REQUESTS[404].code, 'Reply not found.', 404);

  if (reply.status === 'SENT') {
    throw new AppError('ALREADY_SENT', 'This reply has already been sent.', 409);
  }
  if (reply.status === 'UNKNOWN') {
    throw new AppError(
      'RECONCILIATION_REQUIRED',
      'Delivery outcome is unknown. Reconcile before retrying.',
      409
    );
  }
  if (reply.status === 'SENDING') {
    throw new AppError('ALREADY_IN_PROGRESS', 'This reply is currently being sent.', 409);
  }
  if (reply.status !== 'FAILED') {
    throw new AppError('NOT_RETRYABLE', 'This reply is not in a retryable state.', 409);
  }

  await replyModel.updateStatus(replyId, { status: 'PENDING' });
  const email = await emailModel.findById(reply.original_email_id);
  const thread = await threadModel.findById(reply.thread_id);
  await dispatch(reply, {
    gmailThreadId: thread.gmail_thread_id,
    gmailMessageId: email.gmail_message_id,
  });
  return replyModel.findById(replyId);
}

async function getReply(id) {
  const reply = await replyModel.findById(id);
  if (!reply) throw new AppError(HTTP_REQUESTS[404].code, 'Reply not found.', 404);
  return {
    id: reply.id,
    status: reply.status,
    providerMessageId: reply.provider_message_id,
    errorCode: reply.error_code,
    errorMessage: reply.error_message,
    attemptCount: reply.attempt_count,
    retryable: reply.status === 'FAILED',
    needsReconciliation: reply.status === 'UNKNOWN',
    sentAt: reply.sent_at,
    createdAt: reply.created_at,
    updatedAt: reply.updated_at,
  };
}

module.exports = { submitReply, applyOutcome, retry, getReply, fingerprint, OPERATION_TYPE };
