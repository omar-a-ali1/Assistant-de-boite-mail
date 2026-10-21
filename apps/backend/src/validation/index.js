/**
 * Aggregated validation schemas.
 *
 * Domain schemas live in dedicated `*.validation.js` modules; this index keeps
 * a single import point for callers that need several domains.
 *
 * @module validation
 */
const { REPLY_STATUSES } = require('../config/system');
const { uuid, idParam } = require('./common.validation');
const { login, register } = require('./auth.validation');
const { mailConnect } = require('./mail.validation');
const { emailListQuery, summaryQuery } = require('./email.validation');
const { draftCreate, draftUpdate } = require('./draft.validation');
const { replyCreate } = require('./reply.validation');
const {
  importBatch,
  classificationBatch,
  replyOutcome,
  syncRunReport,
  workflowFailure,
} = require('./webhook.validation');
const { aiClassificationOutput } = require('./ai.validation');

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
