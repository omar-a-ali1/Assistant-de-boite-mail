/**
 * Per-user mailbox isolation: a user can never list, read or mutate another
 * user's emails, drafts or replies.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
const request = require('supertest');
const bcrypt = require('bcrypt');
const {
  prepareDatabase,
  truncateAll,
  ensureTestUser,
  authAgent,
  insertEmail,
  createApp,
  query,
  TEST_MAILBOX,
} = require('./helpers');
const { closePool } = require('../config/db');

let app;
const OTHER_EMAIL = 'other@gmail.com';
const OTHER_PASSWORD = 'other-password-123';

async function createOtherUser() {
  const hash = await bcrypt.hash(OTHER_PASSWORD, 4);
  const { rows } = await query(
    `INSERT INTO users (email, password_hash, display_name, mailbox_address)
     VALUES ($1, $2, 'Other User', $1)
     RETURNING id`,
    [OTHER_EMAIL, hash]
  );
  return rows[0].id;
}

async function otherAgent() {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ email: OTHER_EMAIL, password: OTHER_PASSWORD })
    .expect(200);
  return { agent, csrfToken: res.body.data.csrfToken, userId: res.body.data.user.id };
}

describe('per-user mailbox isolation', () => {
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

  it('lists only the authenticated user emails', async () => {
    const { agent } = await authAgent(app);
    const otherId = await createOtherUser();
    await insertEmail({
      userId: otherId,
      gmailThreadId: 'other-thread',
      gmailMessageId: 'other-1',
      subject: 'Message privé B',
      receivedAt: '2026-10-20T09:00:00.000Z',
    });
    await insertEmail({
      gmailThreadId: 'test-thread',
      gmailMessageId: 'test-1',
      subject: 'Message privé A',
      receivedAt: '2026-10-20T10:00:00.000Z',
    });

    const res = await agent.get('/api/v1/emails').expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].subject).toBe('Message privé A');
  });

  it('hides another user thread and blocks cross-user mutations', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const otherId = await createOtherUser();
    const other = await insertEmail({
      userId: otherId,
      gmailThreadId: 'other-thread',
      gmailMessageId: 'other-1',
      subject: 'Message privé B',
    });

    await agent.get(`/api/v1/threads/${other.threadId}`).expect(404);
    await agent
      .post(`/api/v1/emails/${other.emailId}/draft`)
      .set('X-CSRF-Token', csrfToken)
      .send({ tone: 'short' })
      .expect(404);
  });

  it('summarizes only the user own emails for the day', async () => {
    const { agent } = await authAgent(app);
    const otherId = await createOtherUser();
    await insertEmail({
      userId: otherId,
      gmailThreadId: 'other-thread',
      gmailMessageId: 'other-1',
      subject: 'Autre',
      category: 'client',
      priority: 3,
      receivedAt: '2026-10-20T09:00:00.000Z',
    });
    await insertEmail({
      gmailThreadId: 'test-thread',
      gmailMessageId: 'test-1',
      subject: 'À traiter',
      category: 'facture',
      priority: 3,
      receivedAt: '2026-10-20T10:00:00.000Z',
    });

    const res = await agent.get('/api/v1/summary?date=2026-10-20').expect(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.byCategory.facture).toBe(1);
    expect(res.body.data.byCategory.client).toBe(0);
  });

  it('refuses to reply to another user email', async () => {
    const otherId = await createOtherUser();
    const other = await insertEmail({
      userId: otherId,
      gmailThreadId: 'other-thread',
      gmailMessageId: 'other-1',
      subject: 'Message privé B',
    });
    const { agent, csrfToken } = await authAgent(app);

    await agent
      .post(`/api/v1/emails/${other.emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'isolation-reply-key-123')
      .send({ body: 'Tentative.', confirm: true })
      .expect(404);
  });

  it('reports a disconnected demo mailbox and refuses sync without Gmail', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const status = await agent.get('/api/v1/mail/status').expect(200);
    expect(status.body.data.gmailConnected).toBe(false);
    expect(status.body.data.mailbox).toBe(TEST_MAILBOX);

    const res = await agent
      .post('/api/v1/mail/sync')
      .set('X-CSRF-Token', csrfToken)
      .expect(409);
    expect(res.body.error.code).toBe('GMAIL_NOT_CONNECTED');
  });

  it('refuses to connect Gmail for a non-Gmail account', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const res = await agent
      .post('/api/v1/mail/connect')
      .set('X-CSRF-Token', csrfToken)
      .send({ gmailAppPassword: 'abcd efgh ijkl mnop' })
      .expect(400);
    expect(res.body.error.code).toBe('GMAIL_ACCOUNT_REQUIRED');
  });

  it('does not reuse an idempotency key across users', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const otherId = await createOtherUser();
    const other = await insertEmail({
      userId: otherId,
      gmailThreadId: 'other-thread',
      gmailMessageId: 'other-1',
      subject: 'Message privé B',
    });
    const { agent: otherSession, csrfToken: otherCsrf } = await otherAgent();

    await otherSession
      .post(`/api/v1/emails/${other.emailId}/reply`)
      .set('X-CSRF-Token', otherCsrf)
      .set('Idempotency-Key', 'shared-key-12345678')
      .send({ body: 'Réponse B.', confirm: true })
      .expect(202);

    const mine = await insertEmail({
      gmailThreadId: 'test-thread',
      gmailMessageId: 'test-1',
      subject: 'Message privé A',
    });
    const res = await agent
      .post(`/api/v1/emails/${mine.emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'shared-key-12345678')
      .send({ body: 'Réponse A.', confirm: true })
      .expect(202);
    expect(res.body.data.reused).toBe(false);
  });
});
