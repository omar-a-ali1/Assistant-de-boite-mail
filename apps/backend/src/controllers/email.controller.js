/**
 * Email controller: list (filters+pagination), thread detail, summary.
 *
 * @module controllers/email.controller
 */
const emailModel = require('../models/email.model');
const threadModel = require('../models/thread.model');
const draftModel = require('../models/draft.model');
const replyModel = require('../models/reply.model');
const summaryService = require('../services/summary.service');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

function mapEmail(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    sender: row.sender,
    recipients: row.recipients,
    subject: row.subject,
    receivedAt: row.received_at,
    category: row.category,
    priority: row.priority,
    summary: row.summary,
    expectedAction: row.expected_action,
    needsReview: row.needs_review,
    status: row.processing_status,
    preview: row.body_preview,
  };
}

async function list(req, res, next) {
  try {
    const q = req.validatedQuery;
    const { rows, total } = await emailModel.list(q);
    const totalPages = Math.max(1, Math.ceil(total / q.limit));
    res.json({
      data: rows.map(mapEmail),
      meta: { page: q.page, limit: q.limit, total, totalPages },
    });
  } catch (err) {
    next(err);
  }
}

async function getThread(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const thread = await threadModel.findById(id);
    if (!thread) throw new AppError(HTTP_REQUESTS[404].code, 'Thread not found.', 404);

    const [messages, drafts, replies] = await Promise.all([
      emailModel.findByThreadId(id),
      draftModel.findByThreadId(id),
      replyModel.findByThreadId(id),
    ]);

    res.json({
      data: {
        thread: {
          id: thread.id,
          subject: thread.subject,
          gmailThreadId: thread.gmail_thread_id,
          latestMessageAt: thread.latest_message_at,
        },
        messages: messages.map((m) => ({
          id: m.id,
          sender: m.sender,
          recipients: m.recipients,
          subject: m.subject,
          body: m.body_text,
          receivedAt: m.received_at,
          category: m.category,
          priority: m.priority,
          summary: m.summary,
          expectedAction: m.expected_action,
          needsReview: m.needs_review,
          status: m.processing_status,
        })),
        drafts: drafts.map((d) => ({
          id: d.id,
          body: d.body,
          tone: d.tone,
          editedByUser: d.edited_by_user,
          createdAt: d.created_at,
          updatedAt: d.updated_at,
        })),
        replies: replies.map((r) => ({
          id: r.id,
          status: r.status,
          body: r.body,
          providerMessageId: r.provider_message_id,
          errorCode: r.error_code,
          errorMessage: r.error_message,
          attemptCount: r.attempt_count,
          sentAt: r.sent_at,
          createdAt: r.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function summary(req, res, next) {
  try {
    const data = await summaryService.buildSummary(req.validatedQuery.date);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getThread, summary, mapEmail };
