/**
 * Minimal structured logger. Emits single-line JSON to stdout/stderr.
 * Guarantees we never log secrets, cookies, or full email bodies:
 * callers must only pass short metadata, not raw payloads.
 *
 * @module utils/logger
 */
const config = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function emit(level, msg, meta) {
  if (LEVELS[level] > LEVELS[config.logLevel]) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  });
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

module.exports = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
