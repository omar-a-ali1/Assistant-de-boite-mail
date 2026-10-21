/**
 * Email routes: paginated list, thread detail, daily summary.
 * All routes require an authenticated session.
 *
 * @module routes/email
 */
const express = require('express');
const { validateQuery, validateParams } = require('../middlewares/validation.middleware');
const { requireAuth } = require('../middlewares/auth');
const { emailListQuery, summaryQuery } = require('../validation/email.validation');
const { idParam } = require('../validation/common.validation');
const emailController = require('../controllers/email.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/emails', validateQuery(emailListQuery), emailController.list);
router.get('/summary', validateQuery(summaryQuery), emailController.summary);
router.get('/threads/:id', validateParams(idParam), emailController.getThread);

module.exports = router;
