/**
 * Shared test helpers: isolated test DB bootstrap, app factory, fixtures.
 */
const { execSync } = require('node:child_process');
const path = require('node:path');
const bcrypt = require('bcrypt');
const request = require('supertest');

const config = require('../config/env');
const createApp = require('../app');
const { pool, query } = require('../config/db');

const TEST_MAILBOX = config.mailboxAddress;
const TEST_PASSWORD = 'test-password-123';
const TEST_EMAIL = 'tester@example.com';

/** Create the test database if missing and run migrations against it. */
async function prepareDatabase() {
  const adminUrl = config.databaseUrl.replace(/\/[^/]+$/, '/postgres');
  const dbName = config.databaseUrl.split('/').pop().split('?')[0];

  const { Client } = require('pg');
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  }
  await admin.end();

  // Run migrations as a child process bound to the test database.
  execSync('node database/migrate.js', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: config.databaseUrl, NODE_ENV: 'test' },
    stdio: 'ignore',
  });
}

/** Remove all rows from application tables (keeps schema). Test-scoped. */
async function truncateAll() {
  await query(`
    TRUNCATE TABLE audit_events, idempotency_records, replies, drafts, emails,
      threads, sync_runs, sync_state, sessions, users
    RESTART IDENTITY CASCADE
  `);
}

async function ensureTestUser() {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (normalize_email(email))
     DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [TEST_EMAIL, hash, 'Test User']
  );
  return rows[0].id;
}

/** Create an authenticated supertest agent (shares cookies) + CSRF token. */
async function authAgent(app) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
    .expect(200);
  return { agent, csrfToken: res.body.data.csrfToken, userId: res.body.data.user.id };
}

/** Insert a thread + email directly; returns { threadId, emailId }. */
async function insertEmail(overrides = {}) {
  const thread = await query(
    `INSERT INTO threads (mailbox_address, gmail_thread_id, subject, latest_message_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (normalize_email(mailbox_address), gmail_thread_id)
     DO UPDATE SET updated_at = now()
     RETURNING id`,
    [TEST_MAILBOX, overrides.gmailThreadId || 'thread-1', overrides.subject || 'Sujet de test']
  );
  const threadId = thread.rows[0].id;
  const { rows } = await query(
    `INSERT INTO emails (mailbox_address, gmail_message_id, thread_id, sender, recipients,
                         subject, body_text, received_at, category, priority, summary,
                         expected_action, processing_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (normalize_email(mailbox_address), gmail_message_id) DO NOTHING
     RETURNING id`,
    [
      TEST_MAILBOX,
      overrides.gmailMessageId || `msg-${Date.now()}-${Math.random()}`,
      threadId,
      overrides.sender || 'sender@example.com',
      JSON.stringify([TEST_MAILBOX]),
      overrides.subject || 'Sujet de test',
      overrides.bodyText || 'Corps du message de test.',
      overrides.receivedAt || new Date().toISOString(),
      overrides.category || null,
      overrides.priority || null,
      overrides.summary || null,
      overrides.expectedAction || null,
      overrides.status || 'TO_PROCESS',
    ]
  );
  return { threadId, emailId: rows[0].id };
}

module.exports = {
  prepareDatabase,
  truncateAll,
  ensureTestUser,
  authAgent,
  insertEmail,
  createApp,
  pool,
  query,
  TEST_EMAIL,
  TEST_PASSWORD,
  TEST_MAILBOX,
};
