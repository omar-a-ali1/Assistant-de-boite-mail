/**
 * Email list and daily summary schemas.
 *
 * @module validation/email
 */
const Joi = require('joi');
const { EMAIL_CATEGORIES, PROCESSING_STATUSES } = require('../config/system');

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

module.exports = { emailListQuery, summaryQuery };
