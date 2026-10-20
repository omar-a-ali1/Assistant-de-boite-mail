/**
 * Base application error with an API-safe code and message.
 *
 * @module lib/errors/AppError
 */
class AppError extends Error {
  /**
   * @param {string} code - Stable machine-readable error code.
   * @param {string} message - Human-readable, safe-for-client message.
   * @param {number} [status=500] - HTTP status code.
   * @param {Array} [details] - Optional structured details safe to expose.
   */
  constructor(code, message, status = 500, details = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

module.exports = AppError;
