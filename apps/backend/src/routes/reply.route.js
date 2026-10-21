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
const { replyCreate } = require('../validation/reply.validation');
const { idParam } = require('../validation/common.validation');
const replyController = require('../controllers/reply.controller');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/emails/:id/reply',
  validateParams(idParam),
  validate(replyCreate),
  replyController.submitReply
);

router.get('/replies/:id', validateParams(idParam), replyController.getReply);

router.post('/replies/:id/retry', validateParams(idParam), replyController.retryReply);

module.exports = router;
