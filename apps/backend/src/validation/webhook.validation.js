/**
 * n8n webhook payload schemas.
 *
 * @module validation/webhook
 */
const Joi = require('joi');
const { EMAIL_CATEGORIES } = require('../config/system');
const { uuid } = require('./common.validation');

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

const replyOutcome = Joi.object({
  replyId: uuid.required(),
  status: Joi.string().valid('SENT', 'FAILED', 'UNKNOWN').required(),
  providerMessageId: Joi.string().max(255).allow(null),
  errorCode: Joi.string().max(100).allow(null),
  errorMessage: Joi.string().max(500).allow(null),
});

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

const workflowFailure = Joi.object({
  workflowName: Joi.string().max(255).required(),
  executionId: Joi.string().max(255).allow(null),
  errorCode: Joi.string().max(100).allow(null),
  errorMessage: Joi.string().max(500).allow(null),
  occurredAt: Joi.string().isoDate().allow(null),
});

module.exports = {
  importBatch,
  classificationBatch,
  replyOutcome,
  syncRunReport,
  workflowFailure,
};
