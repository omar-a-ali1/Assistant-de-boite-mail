/**
 * Shared request validation primitives.
 *
 * @module validation/common
 */
const Joi = require('joi');

const uuid = Joi.string().uuid({ version: ['uuidv4', 'uuidv5'] });

const idParam = Joi.object({ id: uuid.required() });

module.exports = { uuid, idParam };
