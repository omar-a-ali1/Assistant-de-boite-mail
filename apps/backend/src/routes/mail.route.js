/**
 * Mail routes: Gmail connection status and manual synchronization.
 * All routes require an authenticated session.
 *
 * @module routes/mail
 */
const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { mailSyncLimiter } = require('../middlewares/rateLimit');
const validate = require('../middlewares/validation.middleware');
const { mailConnect } = require('../validation/mail.validation');
const mailController = require('../controllers/mail.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/mail/status', mailController.status);
router.post('/mail/connect', mailSyncLimiter, validate(mailConnect), mailController.connect);
router.post('/mail/sync', mailSyncLimiter, mailController.sync);

module.exports = router;
