/**
 * Rate limiters for abuse-sensitive endpoints (login, webhooks).
 *
 * @module middlewares/rateLimit
 */
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: config.isTest ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please retry later.', details: [] } },
});

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: config.isTest ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests.', details: [] } },
});

module.exports = { loginLimiter, webhookLimiter };
