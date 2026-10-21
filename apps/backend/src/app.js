/**
 * Express application factory. Mounts security middleware, sessions,
 * the API routers and the centralized error handlers.
 *
 * @module app
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const config = require('./config/env');
const { query } = require('./config/db');
const { sessionOptions } = require('./config/session');
const requestContext = require('./middlewares/requestContext');
const { requireCsrf } = require('./middlewares/auth');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const apiRouter = require('./routes');
const webhooksRouter = require('./routes/webhooks');

function createApp() {
  const app = express();

  // Behind a reverse proxy in production (Docker/nginx).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: config.isProduction ? config.frontendOrigin : true, // dev: allow the Vite origin (credentials)
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(require('express-session')(sessionOptions()));
  app.use(requestContext);

  app.get('/api/v1/health', (req, res) => {
    res.json({ data: { status: 'ok', time: new Date().toISOString() } });
  });

  // Readiness: the process is only useful if it can reach PostgreSQL.
  app.get('/api/v1/health/ready', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ data: { status: 'ready', time: new Date().toISOString() } });
    } catch (err) {
      res.status(503).json({
        error: { code: 'NOT_READY', message: 'Database unavailable.', details: [] },
      });
    }
  });

  app.use('/api/v1/webhooks', webhooksRouter);
  // CSRF protection for browser-facing state-changing routes. Webhooks are
  // authenticated by their own shared secret and are mounted above this.
  app.use('/api/v1', requireCsrf);
  app.use('/api/v1', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
