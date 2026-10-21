/**
 * Gmail connection schemas.
 *
 * Google displays App Passwords as four groups; spaces are ignored before
 * validating the normalized value.
 *
 * @module validation/mail
 */
const Joi = require('joi');
const {
  APP_PASSWORD_MIN_LENGTH,
  APP_PASSWORD_MAX_LENGTH,
} = require('../config/system');

const gmailAppPassword = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const normalized = value.replace(/\s+/g, '');
    if (
      normalized.length < APP_PASSWORD_MIN_LENGTH ||
      normalized.length > APP_PASSWORD_MAX_LENGTH ||
      !/^[A-Za-z0-9]+$/.test(normalized)
    ) {
      return helpers.error('string.pattern.base');
    }
    return value;
  })
  .messages({
    'string.pattern.base':
      `gmailAppPassword must contain at least ${APP_PASSWORD_MIN_LENGTH} letters or digits (spaces allowed).`,
  });

const mailConnect = Joi.object({
  gmailAppPassword: gmailAppPassword.required(),
});

module.exports = {
  gmailAppPassword,
  mailConnect,
};
