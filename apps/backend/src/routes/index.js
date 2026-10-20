/**
 * API v1 router. Routes -> controllers -> services -> models.
 * Private routes require an authenticated session + CSRF token.
 *
 * @module routes/index
 */
const express = require('express');
const validate = require('../middlewares/validation.middleware');
const { validateQuery, validateParams } = require('../middlewares/validation.middleware');
const { requireAuth } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimit');
const schemas = require('../validation/schemas');

const authController = require('../controllers/auth.controller');
const emailController = require('../controllers/email.controller');
const draftController = require('../controllers/draft.controller');
const replyController = require('../controllers/reply.controller');

const router = express.Router();

// --- Auth (public) ---
router.post('/auth/login', loginLimiter, validate(schemas.login), authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.me);

// --- Private routes ---
router.get(
  '/emails',
  requireAuth,
  validateQuery(schemas.emailListQuery),
  emailController.list
);

router.get(
  '/summary',
  requireAuth,
  validateQuery(schemas.summaryQuery),
  emailController.summary
);

router.get(
  '/threads/:id',
  requireAuth,
  validateParams(schemas.idParam),
  emailController.getThread
);

router.post(
  '/emails/:id/draft',
  requireAuth,
  validateParams(schemas.idParam),
  validate(schemas.draftCreate),
  draftController.createDraft
);

router.patch(
  '/drafts/:id',
  requireAuth,
  validateParams(schemas.idParam),
  validate(schemas.draftUpdate),
  draftController.updateDraft
);

router.post(
  '/emails/:id/reply',
  requireAuth,
  validateParams(schemas.idParam),
  validate(schemas.replyCreate),
  replyController.submitReply
);

router.get(
  '/replies/:id',
  requireAuth,
  validateParams(schemas.idParam),
  replyController.getReply
);

router.post(
  '/replies/:id/retry',
  requireAuth,
  validateParams(schemas.idParam),
  replyController.retryReply
);

module.exports = router;
