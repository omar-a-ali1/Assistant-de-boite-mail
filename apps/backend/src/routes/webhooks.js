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
const validate = require('../middlewares/validation.middleware');
const { importBatch, classificationBatch, replyOutcome, syncRunReport, workflowFailure } = require('../validation/webhook.validation');
const { webhookLimiter } = require('../middlewares/rateLimit');
const webhookController = require('../controllers/webhook.controller');

const router = express.Router();

/** Timing-safe shared-secret check for n8n -> backend calls. */
function requireWebhookSecret(req, res, next) {
  const provided = req.get('X-Webhook-Secret') || '';
  const expected = config.n8n.webhookSecret;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!provided || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret.', details: [] },
    });
  }
  next();
}

router.use(webhookLimiter);
router.use(requireWebhookSecret);

router.get('/sync/state', webhookController.getSyncState);
router.post('/sync/import', validate(importBatch), webhookController.importEmails);
router.post('/sync/run', validate(syncRunReport), webhookController.syncRun);

router.get('/classification/pending', webhookController.pendingClassifications);
router.post(
  '/classification/results',
  validate(classificationBatch),
  webhookController.saveClassifications
);

router.post('/reply/outcome', validate(replyOutcome), webhookController.replyOutcome);

router.post('/workflow/failure', validate(workflowFailure), webhookController.workflowFailure);

module.exports = router;
module.exports.requireWebhookSecret = requireWebhookSecret;
