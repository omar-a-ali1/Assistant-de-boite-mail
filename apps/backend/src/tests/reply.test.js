/**
 * Reply idempotency + delivery state machine tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
const request = require('supertest');
const {
  prepareDatabase,
  truncateAll,
  ensureTestUser,
  authAgent,
  insertEmail,
  query,
  createApp,
} = require('./helpers');
const { closePool } = require('../config/db');

let app;

async function prepare() {
  await truncateAll();
  await ensureTestUser();
}

describe('reply idempotency and delivery state', () => {
  beforeAll(async () => {
    await prepareDatabase();
    app = createApp();
  });
  afterAll(async () => {
    await closePool();
  });
  beforeEach(prepare);

  it('submits a reply and returns a durable operation', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const res = await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ body: 'Merci pour votre message.', confirm: true })
      .expect(202);

    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.reused).toBe(false);
  });

  it('submitting the same operation twice reuses it (no second send)', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    const key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const payload = { body: 'Réponse unique.', confirm: true };

    const first = await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);
    const second = await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(200);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(second.body.data.reused).toBe(true);

    const count = await query('SELECT COUNT(*)::int AS c FROM replies');
    expect(count.rows[0].c).toBe(1);
  });

  it('rejects reuse of a key with a different payload (409)', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    const key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ body: 'Premier contenu.', confirm: true })
      .expect(202);

    await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ body: 'Contenu différent.', confirm: true })
      .expect(409);
  });

  it('concurrent requests with the same key create one reply', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    const key = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    const fire = () =>
      agent
        .post(`/api/v1/emails/${emailId}/reply`)
        .set('X-CSRF-Token', csrfToken)
        .set('Idempotency-Key', key)
        .send({ body: 'Concurrent.', confirm: true });

    const results = await Promise.all([fire(), fire(), fire(), fire()]);
    const ok = results.filter((r) => [200, 202].includes(r.status));
    expect(ok.length).toBe(4); // every response is a success or a reuse, never an error

    const count = await query('SELECT COUNT(*)::int AS c FROM replies');
    expect(count.rows[0].c).toBe(1);
  });

  it('does not send an unapproved reply (confirm required)', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
      .send({ body: 'Sans confirmation.' })
      .expect(400);
    const count = await query('SELECT COUNT(*)::int AS c FROM replies');
    expect(count.rows[0].c).toBe(0);
  });

  it('requires an idempotency key', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Sans clé.', confirm: true })
      .expect(400);
  });

  it('handles an uncertain provider outcome as UNKNOWN and blocks blind retry', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    const key = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    const res = await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ body: 'Incertain.', confirm: true })
      .expect(202);
    const replyId = res.body.data.id;

    await request(app)
      .post('/api/v1/webhooks/reply/outcome')
      .set('X-Webhook-Secret', process.env.N8N_WEBHOOK_SECRET)
      .send({ replyId, status: 'UNKNOWN' })
      .expect(200);

    const status = await agent.get(`/api/v1/replies/${replyId}`).expect(200);
    expect(status.body.data.status).toBe('UNKNOWN');
    expect(status.body.data.needsReconciliation).toBe(true);
    expect(status.body.data.retryable).toBe(false);

    // Blind retry must be refused.
    await agent
      .post(`/api/v1/replies/${replyId}/retry`)
      .set('X-CSRF-Token', csrfToken)
      .expect(409);
  });

  it('allows safe retry only for FAILED replies and is idempotent on SENT', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const { emailId } = await insertEmail();
    const key = '99999999-9999-4999-8999-999999999999';
    const res = await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('X-CSRF-Token', csrfToken)
      .set('Idempotency-Key', key)
      .send({ body: 'Échec puis succès.', confirm: true })
      .expect(202);
    const replyId = res.body.data.id;

    await request(app)
      .post('/api/v1/webhooks/reply/outcome')
      .set('X-Webhook-Secret', process.env.N8N_WEBHOOK_SECRET)
      .send({ replyId, status: 'FAILED', errorCode: 'BOUNCE', errorMessage: 'Rejected.' })
      .expect(200);

    const failed = await agent.get(`/api/v1/replies/${replyId}`).expect(200);
    expect(failed.body.data.retryable).toBe(true);

    await agent.post(`/api/v1/replies/${replyId}/retry`).set('X-CSRF-Token', csrfToken).expect(200);

    await request(app)
      .post('/api/v1/webhooks/reply/outcome')
      .set('X-Webhook-Secret', process.env.N8N_WEBHOOK_SECRET)
      .send({ replyId, status: 'SENT', providerMessageId: 'gmail-xyz' })
      .expect(200);
    // Applying SENT again stays SENT (idempotent).
    const done = await request(app)
      .post('/api/v1/webhooks/reply/outcome')
      .set('X-Webhook-Secret', process.env.N8N_WEBHOOK_SECRET)
      .send({ replyId, status: 'SENT', providerMessageId: 'gmail-xyz' })
      .expect(200);
    expect(done.body.data.status).toBe('SENT');

    await agent.post(`/api/v1/replies/${replyId}/retry`).set('X-CSRF-Token', csrfToken).expect(409);
  });
});
