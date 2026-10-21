/**
 * Server entrypoint: starts HTTP listener and registers graceful
 * shutdown (stop accepting connections, close the pg pool).
 */
const config = require('./src/config/env');
const createApp = require('./src/app');
const { closePool } = require('./src/config/db');
const replyService = require('./src/services/reply.service');
const logger = require('./src/utils/logger');

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, env: config.env });
});

// Reconcile replies stuck in SENDING (workflow crash after dispatch) so they
// surface as UNKNOWN and require explicit reconciliation rather than hanging.
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;
async function reconcileStale() {
  try {
    const count = await replyService.reconcileStaleSending({ olderThanMinutes: 15 });
    if (count > 0) logger.warn('reply_stale_sending_swept', { count });
  } catch (err) {
    logger.error('reply_stale_sending_sweep_failed', { message: err.message });
  }
}
const reconcileTimer = setInterval(reconcileStale, RECONCILE_INTERVAL_MS);
reconcileTimer.unref();
setTimeout(reconcileStale, 5_000).unref();

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
