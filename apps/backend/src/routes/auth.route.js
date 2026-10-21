/**
 * Authentication routes (public).
 *
 * @module routes/auth
 */
const express = require('express');
const validate = require('../middlewares/validation.middleware');
const { loginLimiter, registerLimiter } = require('../middlewares/rateLimit');
const schemas = require('../validation/schemas');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/auth/register', registerLimiter, validate(schemas.register), authController.register);
router.post('/auth/login', loginLimiter, validate(schemas.login), authController.login);
router.post('/auth/logout', authController.logout);
router.get('/auth/me', authController.me);

module.exports = router;
