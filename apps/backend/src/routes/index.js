/**
 * API v1 router. Routes -> controllers -> services -> models.
 * Private routes require an authenticated session + CSRF token.
 *
 * Route modules are split per resource for readability:
 *   auth.route, email.route, draft.route, reply.route.
 *
 * @module routes/index
 */
const express = require('express');

const authRoutes = require('./auth.route');
const emailRoutes = require('./email.route');
const draftRoutes = require('./draft.route');
const replyRoutes = require('./reply.route');
const mailRoutes = require('./mail.route');

const router = express.Router();

// Auth routes are public (login) or self-guarded (me/logout).
router.use(authRoutes);

// Private route modules enforce requireAuth at their own boundary.
router.use(emailRoutes);
router.use(draftRoutes);
router.use(replyRoutes);
router.use(mailRoutes);

module.exports = router;
