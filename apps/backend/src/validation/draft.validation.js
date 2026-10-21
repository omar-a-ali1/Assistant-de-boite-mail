/**
 * Draft request schemas.
 *
 * @module validation/draft
 */
const Joi = require('joi');
const { DRAFT_TONES } = require('../config/system');

const draftCreate = Joi.object({
  tone: Joi.string().valid(...DRAFT_TONES).required(),
});

const draftUpdate = Joi.object({
  body: Joi.string().trim().min(1).max(20_000).required(),
  tone: Joi.string().valid(...DRAFT_TONES),
});

module.exports = { draftCreate, draftUpdate };
