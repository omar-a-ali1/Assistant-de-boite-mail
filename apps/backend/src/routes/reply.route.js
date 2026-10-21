/**
 * Reply routes: idempotent submit, status and safe retry.
 * All routes require an authenticated session.
 *
 * @module routes/reply
 */
const express = require('express');
const validate = require('../middlewares/validation.middleware');
const { validateParams } = require('../middlewares/validation.middleware');
const { requireAuth } = require('../middlewares/auth');
const schemas = require('../validation/schemas');
const replyController = require('../controllers/reply.controller');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/emails/:id/reply',
  validateParams(schemas.idParam),
  validate(schemas.replyCreate),
  replyController.submitReply
);

router.get('/replies/:id', validateParams(schemas.idParam), replyController.getReply);

router.post('/replies/:id/retry', validateParams(schemas.idParam), replyController.retryReply);

module.exports = router;
