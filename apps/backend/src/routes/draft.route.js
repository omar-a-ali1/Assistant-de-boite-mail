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
const schemas = require('../validation/schemas');
const draftController = require('../controllers/draft.controller');

const router = express.Router();

router.use(requireAuth);

router.post(
  '/emails/:id/draft',
  validateParams(schemas.idParam),
  validate(schemas.draftCreate),
  draftController.createDraft
);

router.patch(
  '/drafts/:id',
  validateParams(schemas.idParam),
  validate(schemas.draftUpdate),
  draftController.updateDraft
);

module.exports = router;
