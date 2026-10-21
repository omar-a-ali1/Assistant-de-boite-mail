/**
 * Email routes: paginated list, thread detail, daily summary.
 * All routes require an authenticated session.
 *
 * @module routes/email
 */
const express = require('express');
const { validateQuery, validateParams } = require('../middlewares/validation.middleware');
const { requireAuth } = require('../middlewares/auth');
const schemas = require('../validation/schemas');
const emailController = require('../controllers/email.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/emails', validateQuery(schemas.emailListQuery), emailController.list);
router.get('/summary', validateQuery(schemas.summaryQuery), emailController.summary);
router.get('/threads/:id', validateParams(schemas.idParam), emailController.getThread);

module.exports = router;
