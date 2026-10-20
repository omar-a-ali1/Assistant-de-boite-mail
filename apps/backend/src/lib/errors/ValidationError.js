/**
 * Validation error (400) carrying per-field details.
 *
 * @module lib/errors/ValidationError
 */
const AppError = require('./AppError');
const { HTTP_REQUESTS } = require('../../config/system');

class ValidationError extends AppError {
  /**
   * @param {string} [message] - Optional override message.
   */
  constructor(message = HTTP_REQUESTS[400].message) {
    super(HTTP_REQUESTS[400].code, message, 400);
    this.name = 'ValidationError';
    this.fields = [];
  }
}

module.exports = ValidationError;
