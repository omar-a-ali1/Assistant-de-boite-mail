/**
 * Authentication request schemas.
 *
 * @module validation/auth
 */
const Joi = require('joi');
const { gmailAppPassword } = require('./mail.validation');

const login = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().min(1).max(200).required(),
});

const register = Joi.object({
  email: Joi.string().trim().lowercase().email().max(254).required(),
  password: Joi.string().min(8).max(200).required(),
  displayName: Joi.string().trim().max(100).allow('').default(''),
  gmailAppPassword: gmailAppPassword.required(),
});

module.exports = { login, register };
