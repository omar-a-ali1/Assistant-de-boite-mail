/**
 * Webhook controllers: handlers for secured n8n callbacks.
 *
 * @module controllers/webhook.controller
 */
const config = require('../config/env');
const importService = require('../services/import.service');
const replyService = require('../services/reply.service');
const emailModel = require('../models/email.model');
const syncModel = require('../models/sync.model');
const userModel = require('../models/user.model');
const auditModel = require('../models/audit.model');
const AppError = require('../lib/errors/AppError');
const logger = require('../utils/logger');

/** Return the durable sync checkpoint for a mailbox. */
async function getSyncState(req, res, next) {
  try {
    const mailbox = req.query.mailbox || config.mailboxAddress;
    const user = await userModel.findByMailbox(mailbox);
    if (!user) throw new AppError('MAILBOX_NOT_FOUND', 'No account owns this mailbox.', 404);
    const state = await syncModel.getState(user.id);
    res.json({ data: { mailbox, cursor: state ? state.cursor : null, lastSyncAt: state ? state.last_sync_at : null } });
  } catch (err) {
    next(err);
  }
}

/** Ingest a batch of imported messages (idempotent). */
async function importEmails(req, res, next) {
  try {
    const { mailbox, cursor, executionId, messages } = req.validatedBody;
    const user = await userModel.findByMailbox(mailbox);
    if (!user) throw new AppError('MAILBOX_NOT_FOUND', 'No account owns this mailbox.', 404);
    const result = await importService.importBatch({
      userId: user.id,
      mailbox,
      cursor,
      executionId,
      messages,
    });
    res.status(202).json({ data: { ...result, mailbox } });
  } catch (err) {
    next(err);
  }
}

/** Store validated AI classification results. */
async function saveClassifications(req, res, next) {
  try {
    const { results } = req.validatedBody;
    let updated = 0;
    for (const r of results) {
      const row = await emailModel.updateClassification(r.emailId, {
        category: r.category,
        priority: r.priority,
        summary: r.summary,
        expectedAction: r.expectedAction,
        needsReview: r.needsReview || false,
      });
      if (row) updated += 1;
    }
    await auditModel.record({
      eventType: 'classifications_saved',
      actor: 'n8n',
      resourceType: 'mailbox',
      metadata: { updated },
    });
    res.json({ data: { updated } });
  } catch (err) {
    next(err);
  }
}

/** Unclassified emails for the classification workflow to poll. */
async function pendingClassifications(req, res, next) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const rows = await emailModel.findUnclassified({ limit });
    res.json({
      data: rows.map((r) => ({
        emailId: r.id,
        subject: r.subject,
        body: r.body_text,
        sender: r.sender,
        receivedAt: r.received_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/** Apply a reply delivery outcome reported by n8n. */
async function replyOutcome(req, res, next) {
  try {
    const outcome = req.validatedBody;
    const reply = await replyService.applyOutcome(outcome);
    res.json({ data: { id: reply.id, status: reply.status } });
  } catch (err) {
    next(err);
  }
}

/** Record a sync run status report. */
async function syncRun(req, res, next) {
  try {
    const body = req.validatedBody;
    const user = await userModel.findByMailbox(body.mailbox);
    if (!user) throw new AppError('MAILBOX_NOT_FOUND', 'No account owns this mailbox.', 404);
    let runId = req.get('X-Sync-Run-Id');
    if (!runId) {
      const started = await syncModel.startRun({
        userId: user.id,
        mailbox: body.mailbox,
        cursorStart: body.cursorStart,
        executionId: body.executionId,
      });
      runId = started.id;
    }
    const finished = await syncModel.finishRun(runId, {
      status: body.status,
      cursorEnd: body.cursorEnd,
      importedCount: body.importedCount,
      updatedCount: body.updatedCount,
      skippedCount: body.skippedCount,
      failedCount: body.failedCount,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
    });
    res.json({ data: { id: finished.id, status: finished.status } });
  } catch (err) {
    next(err);
  }
}

/** Persist a sanitized workflow failure (from the n8n Error Trigger). */
async function workflowFailure(req, res, next) {
  try {
    const body = req.validatedBody;
    await auditModel.record({
      eventType: 'workflow_failure',
      actor: 'n8n',
      resourceType: 'workflow',
      metadata: {
        workflowName: body.workflowName,
        executionId: body.executionId,
        errorCode: body.errorCode,
        // errorMessage is already bounded/sanitized by Joi (max 500 chars).
        errorMessage: body.errorMessage,
        occurredAt: body.occurredAt,
      },
    });
    logger.warn('workflow_failure', { workflowName: body.workflowName, errorCode: body.errorCode });
    res.status(202).json({ data: { recorded: true } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSyncState,
  importEmails,
  saveClassifications,
  pendingClassifications,
  replyOutcome,
  syncRun,
  workflowFailure,
};
