/**
 * PostgreSQL connection management: a single bounded pool shared by the
 * application, with clean shutdown support.
 *
 * @module config/db
 */
const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.isTest ? 5 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  application_name: 'usts-email-assistant',
});

pool.on('error', (err) => {
  // Unexpected pool error (e.g. server restart). Do not crash the process.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', code: err.code }));
});

/**
 * Run a query with a dedicated client from the pool.
 * Always use this (or a transaction) so clients are released properly.
 *
 * @param {string} text - SQL with $1..$n placeholders.
 * @param {Array} [params] - Query parameters.
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a client for multi-statement transactions.
 * The caller MUST release it (prefer withTransaction below).
 */
async function connect() {
  return pool.connect();
}

/**
 * Execute `fn(client)` inside a transaction. Commits on success,
 * rolls back on any thrown error, always releases the client.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback failure is secondary */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Close the pool gracefully (used on shutdown and in tests). */
async function closePool() {
  await pool.end();
}

module.exports = { pool, query, connect, withTransaction, closePool };
