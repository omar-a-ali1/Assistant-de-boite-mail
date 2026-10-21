/**
 * Email import idempotency tests (webhook import path + DB constraints).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
const {
  prepareDatabase,
  truncateAll,
  query,
  createApp,
  ensureTestUser,
  TEST_MAILBOX,
  TEST_EMAIL,
} = require('./helpers');
const { closePool } = require('../config/db');

const SECRET = process.env.N8N_WEBHOOK_SECRET;
let app;

function message(overrides = {}) {
  return {
    gmailMessageId: 'gmail-msg-1',
    gmailThreadId: 'gmail-thread-1',
    sender: 'client@example.com',
    recipients: [TEST_MAILBOX],
    subject: 'Bonjour',
    bodyText: 'Contenu',
    receivedAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('email import idempotency', () => {
  beforeAll(async () => {
    await prepareDatabase();
    app = createApp();
  });
  afterAll(async () => {
    await closePool();
  });
  beforeEach(async () => {
    await truncateAll();
    await ensureTestUser();
  });

  it('imports a new email', async () => {
    const res = await require('supertest')(app)
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({ mailbox: TEST_MAILBOX, cursor: 'c1', messages: [message()] })
      .expect(202);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.skipped).toBe(0);
  });

  it('importing the same message twice stores it once', async () => {
    const agent = require('supertest')(app);
    await agent
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({ mailbox: TEST_MAILBOX, messages: [message()] })
      .expect(202);
    const second = await agent
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({ mailbox: TEST_MAILBOX, messages: [message()] })
      .expect(202);
    expect(second.body.data.imported).toBe(0);
    expect(second.body.data.skipped).toBe(1);

    const count = await query('SELECT COUNT(*)::int AS c FROM emails WHERE gmail_message_id = $1', [
      'gmail-msg-1',
    ]);
    expect(count.rows[0].c).toBe(1);
  });

  it('handles a batch containing duplicate messages', async () => {
    const res = await require('supertest')(app)
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({ mailbox: TEST_MAILBOX, messages: [message(), message()] })
      .expect(202);
    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.skipped).toBe(1);
  });

  it('enforces uniqueness at the database level', async () => {
    const user = await query('SELECT id FROM users WHERE normalize_email(email) = normalize_email($1)', [TEST_EMAIL]);
    const userId = user.rows[0].id;
    await query(
      `INSERT INTO threads (user_id, mailbox_address, gmail_thread_id, subject) VALUES ($1,$2,'dt','s')`,
      [userId, TEST_MAILBOX]
    );
    const t = await query('SELECT id FROM threads WHERE user_id = $1 AND gmail_thread_id = $2', [userId, 'dt']);
    const insert = `INSERT INTO emails (user_id, mailbox_address, gmail_message_id, thread_id, sender, recipients, subject, body_text, received_at)
                    VALUES ($1,$2,'dup-msg',$3,'s','[]','sub','body', now())`;
    await query(insert, [userId, TEST_MAILBOX, t.rows[0].id]);
    await expect(query(insert, [userId, TEST_MAILBOX, t.rows[0].id])).rejects.toThrow();
  });

  it('reuses an existing thread for additional messages', async () => {
    const agent = require('supertest')(app);
    await agent
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({ mailbox: TEST_MAILBOX, messages: [message({ gmailMessageId: 'm1' })] })
      .expect(202);
    await agent
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({
        mailbox: TEST_MAILBOX,
        messages: [message({ gmailMessageId: 'm2', bodyText: 'Réponse' })],
      })
      .expect(202);

    const threads = await query('SELECT COUNT(*)::int AS c FROM threads');
    expect(threads.rows[0].c).toBe(1);
    const emails = await query('SELECT COUNT(*)::int AS c FROM emails');
    expect(emails.rows[0].c).toBe(2);
  });
});
