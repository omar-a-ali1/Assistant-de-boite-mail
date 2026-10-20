/**
 * Server entrypoint: starts HTTP listener and registers graceful
 * shutdown (stop accepting connections, close the pg pool).
 */
const config = require('./src/config/env');
const createApp = require('./src/app');
const { closePool } = require('./src/config/db');
const logger = require('./src/utils/logger');

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.env });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('server_stopping', { signal });
  server.close(async () => {
    await closePool().catch(() => {});
    logger.info('server_stopped', {});
    process.exit(0);
  });
  // Failsafe: force exit if something hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
});

module.exports = server;
