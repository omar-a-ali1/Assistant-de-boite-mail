/**
 * Centralized error handler. Converts known errors into the standard
 * `{ error: { code, message, details } }` contract. Unknown errors are
 * logged server-side (with stack) but the client only receives a generic
 * 500 message — no SQL details, stack traces, or payload contents.
 *
 * @module middlewares/errorHandler
 */
const config = require('../config/env');
const AppError = require('../lib/errors/AppError');
const { HTTP_REQUESTS } = require('../config/system');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    if (err.status >= 500 && req.log) {
      req.log.error('request_failed', { code: err.code, status: err.status });
    }
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.fields || err.details || [] },
    });
  }

  // Body-parser / JSON syntax errors
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'The request body is not valid JSON.', details: [] },
    });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.', details: [] },
    });
  }

  const meta = {
    status: err.status || 500,
    code: err.code || 'INTERNAL_ERROR',
    name: err.name,
    stack: config.isProduction ? undefined : err.stack,
  };
  if (req.log) req.log.error('unhandled_error', meta);
  else console.error('[errorHandler]', meta); // eslint-disable-line no-console

  const http = HTTP_REQUESTS[500];
  return res.status(500).json({ error: { code: http.code, message: http.message, details: [] } });
}

/** 404 fallback for unmatched routes. */
function notFoundHandler(req, res) {
  const http = HTTP_REQUESTS[404];
  res.status(404).json({ error: { code: http.code, message: http.message, details: [] } });
}

module.exports = { errorHandler, notFoundHandler };
