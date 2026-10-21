/**
 * Centralized Joi schemas for HTTP request validation AND external
 * payload validation (n8n webhooks, AI outputs). Unknown fields are
 * stripped by the validation middleware.
 *
 * @module validation/schemas
 */
const Joi = require('joi');
const {
  EMAIL_CATEGORIES,
  PROCESSING_STATUSES,
  DRAFT_TONES,
  REPLY_STATUSES,
} = require('../config/system');

const uuid = Joi.string().uuid({ version: ['uuidv4', 'uuidv5'] });

// --- Auth ---
const login = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().min(1).max(200).required(),
});

const register = Joi.object({
  email: Joi.string().trim().lowercase().email().max(254).required(),
  password: Joi.string().min(8).max(200).required(),
  displayName: Joi.string().trim().max(100).allow('').default(''),
  gmailAppPassword: Joi.string()
    .trim()
    .pattern(/^(?:\s*[A-Za-z0-9]\s*){8}$/)
    .required()
    .messages({
      'string.pattern.base':
        'gmailAppPassword must contain exactly 16 letters or digits (spaces allowed).',
    }),
});

const mailConnect = Joi.object({
  gmailAppPassword: Joi.string()
    .trim()
    .pattern(/^(?:\s*[A-Za-z0-9]\s*){16}$/)
    .required()
    .messages({
      'string.pattern.base':
        'gmailAppPassword must contain exactly 16 letters or digits (spaces allowed).',
    }),
});

// --- Email list query ---
const emailListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  category: Joi.string().valid(...EMAIL_CATEGORIES),
  priority: Joi.number().integer().min(1).max(3),
  status: Joi.string().valid(...PROCESSING_STATUSES),
  sender: Joi.string().trim().max(254),
  startDate: Joi.string().isoDate(),
  endDate: Joi.string().isoDate(),
  search: Joi.string().trim().max(200),
  sortBy: Joi.string().valid('received_at', 'subject', 'sender', 'priority', 'category', 'status'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const summaryQuery = Joi.object({
  date: Joi.string().isoDate().required(),
});

// --- Drafts ---
const draftCreate = Joi.object({
  tone: Joi.string().valid(...DRAFT_TONES).required(),
});

const draftUpdate = Joi.object({
  body: Joi.string().trim().min(1).max(20_000).required(),
  tone: Joi.string().valid(...DRAFT_TONES),
});

// --- Replies ---
const replyCreate = Joi.object({
  draftId: uuid,
  body: Joi.string().trim().min(1).max(20_000),
  confirm: Joi.boolean().valid(true).required(),
}).or('draftId', 'body');

// --- Route params ---
const idParam = Joi.object({ id: uuid.required() });

// --- Webhook: email batch import ---
const importMessage = Joi.object({
  gmailMessageId: Joi.string().max(255).required(),
  gmailThreadId: Joi.string().max(255).required(),
  sender: Joi.string().max(500).required(),
  recipients: Joi.array().items(Joi.string().max(500)).default([]),
  subject: Joi.string().max(1000).allow('').default(''),
  bodyText: Joi.string().max(500_000).allow('').default(''),
  receivedAt: Joi.string().isoDate().required(),
});

const importBatch = Joi.object({
  mailbox: Joi.string().email().required(),
  cursor: Joi.string().max(500).allow(null),
  executionId: Joi.string().max(255).allow(null),
  messages: Joi.array().items(importMessage).min(1).max(100).required(),
});

// --- Webhook: classification results ---
const classificationResult = Joi.object({
  emailId: uuid.required(),
  category: Joi.string().valid(...EMAIL_CATEGORIES).required(),
  priority: Joi.number().integer().min(1).max(3).required(),
  summary: Joi.string().max(500).required(),
  expectedAction: Joi.string().max(500).required(),
  needsReview: Joi.boolean().default(false),
});

const classificationBatch = Joi.object({
  results: Joi.array().items(classificationResult).min(1).max(100).required(),
});

// --- Webhook: reply outcome ---
const replyOutcome = Joi.object({
  replyId: uuid.required(),
  status: Joi.string().valid('SENT', 'FAILED', 'UNKNOWN').required(),
  providerMessageId: Joi.string().max(255).allow(null),
  errorCode: Joi.string().max(100).allow(null),
  errorMessage: Joi.string().max(500).allow(null),
});

// --- Webhook: sync run reporting ---
const syncRunReport = Joi.object({
  mailbox: Joi.string().email().required(),
  executionId: Joi.string().max(255).allow(null),
  status: Joi.string().valid('RUNNING', 'SUCCESS', 'FAILED').required(),
  cursorStart: Joi.string().max(500).allow(null),
  cursorEnd: Joi.string().max(500).allow(null),
  importedCount: Joi.number().integer().min(0).default(0),
  updatedCount: Joi.number().integer().min(0).default(0),
  skippedCount: Joi.number().integer().min(0).default(0),
  failedCount: Joi.number().integer().min(0).default(0),
  errorCode: Joi.string().max(100).allow(null),
  errorMessage: Joi.string().max(500).allow(null),
});

// --- Webhook: workflow failure report ---
const workflowFailure = Joi.object({
  workflowName: Joi.string().max(255).required(),
  executionId: Joi.string().max(255).allow(null),
  errorCode: Joi.string().max(100).allow(null),
  errorMessage: Joi.string().max(500).allow(null),
  occurredAt: Joi.string().isoDate().allow(null),
});

/**
 * AI classification output schema. Validated independently from HTTP
 * input because model JSON must never be trusted.
 */
const aiClassificationOutput = Joi.object({
  category: Joi.string().valid(...EMAIL_CATEGORIES).required(),
  priority: Joi.number().integer().min(1).max(3).required(),
  summary: Joi.string().trim().min(3).max(500).required(),
  expectedAction: Joi.string().trim().min(3).max(500).required(),
});

module.exports = {
  uuid,
  login,
  register,
  mailConnect,
  emailListQuery,
  summaryQuery,
  draftCreate,
  draftUpdate,
  replyCreate,
  idParam,
  importBatch,
  classificationBatch,
  replyOutcome,
  syncRunReport,
  workflowFailure,
  aiClassificationOutput,
  REPLY_STATUSES,
};
