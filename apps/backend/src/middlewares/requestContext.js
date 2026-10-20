/**
 * Assigns a correlation id to every request and attaches a
 * request-scoped logger. Never logs bodies or credentials.
 *
 * @module middlewares/requestContext
 */
const crypto = require('node:crypto');
const logger = require('../utils/logger');

function requestContext(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.log = {
    error: (msg, meta) => logger.error(msg, { requestId: req.id, ...meta }),
    warn: (msg, meta) => logger.warn(msg, { requestId: req.id, ...meta }),
    info: (msg, meta) => logger.info(msg, { requestId: req.id, ...meta }),
    debug: (msg, meta) => logger.debug(msg, { requestId: req.id, ...meta }),
  };
  next();
}

module.exports = requestContext;
