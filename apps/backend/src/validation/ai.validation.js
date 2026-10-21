/**
 * AI output schema. Model JSON is untrusted and validated independently
 * from HTTP input.
 *
 * @module validation/ai
 */
const Joi = require('joi');
const { EMAIL_CATEGORIES } = require('../config/system');

const aiClassificationOutput = Joi.object({
  category: Joi.string().valid(...EMAIL_CATEGORIES).required(),
  priority: Joi.number().integer().min(1).max(3).required(),
  summary: Joi.string().trim().min(3).max(500).required(),
  expectedAction: Joi.string().trim().min(3).max(500).required(),
});

module.exports = { aiClassificationOutput };
