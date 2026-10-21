/**
 * Draft routes: AI draft generation and user editing.
 * Drafts are never sent from here.
 *
 * @module routes/draft
 */
const express = require('express');
const validate = require('../middlewares/validation.middleware');
const { validateParams } = require('../middlewares/validation.middleware');
const { requireAuth } = require('../middlewares/auth');
const { draftCreate, draftUpdate } = require('../validation/draft.validation');
const { idParam } = require('../validation/common.validation');
const draftController = require('../controllers/draft.controller');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/emails/:id/draft',
  validateParams(idParam),
  validate(draftCreate),
  draftController.createDraft
);

router.patch(
  '/drafts/:id',
  validateParams(idParam),
  validate(draftUpdate),
  draftController.updateDraft
);

module.exports = router;
