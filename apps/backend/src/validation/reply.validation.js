/**
 * Reply request schemas.
 *
 * @module validation/reply
 */
const Joi = require('joi');
const { uuid } = require('./common.validation');

const replyCreate = Joi.object({
  draftId: uuid,
  body: Joi.string().trim().min(1).max(20_000),
  confirm: Joi.boolean().valid(true).required(),
}).or('draftId', 'body');

module.exports = { replyCreate };
