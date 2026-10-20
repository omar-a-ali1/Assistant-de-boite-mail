/**
 * Secured webhook endpoints used by n8n workflows (never exposed to the
 * browser app logic). Authenticated via the shared secret header
 * X-Webhook-Secret with a timing-safe comparison.
 *
 * @module routes/webhooks
 */
const express = require('express');
const crypto = require('node:crypto');
const config = require('../config/env');
const { HTTP_REQUESTS } = require('../config/system');

const router = express.Router();

/** Timing-safe shared-secret check for n8n -> backend calls. */
function requireWebhookSecret(req, res, next) {
  const provided = req.get('X-Webhook-Secret') || '';
  const expected = config.n8n.webhookSecret;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!provided || !crypto.timingSafeEqual(a, b)) {
    const http = HTTP_REQUESTS[401];
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret.', details: [] },
    });
  }
  next();
}

router.use(requireWebhookSecret);

module.exports = router;
module.exports.requireWebhookSecret = requireWebhookSecret;
