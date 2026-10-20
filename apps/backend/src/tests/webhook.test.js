/**
 * Webhook security tests: secret required, timing-safe comparison,
 * payload validation, safe errors.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const { prepareDatabase, createApp, TEST_MAILBOX } = require('./helpers');
const { closePool } = require('../config/db');

const SECRET = process.env.N8N_WEBHOOK_SECRET;
let app;

const validBatch = {
  mailbox: TEST_MAILBOX,
  messages: [
    {
      gmailMessageId: 'sec-1',
      gmailThreadId: 'sec-thread',
      sender: 'a@b.fr',
      recipients: [TEST_MAILBOX],
      subject: 's',
      bodyText: 'b',
      receivedAt: '2026-10-20T10:00:00.000Z',
    },
  ],
};

describe('webhook security', () => {
  beforeAll(async () => {
    await prepareDatabase();
    app = createApp();
  });
  afterAll(async () => {
    await closePool();
  });

  it('rejects a missing secret', async () => {
    await request(app).get('/api/v1/webhooks/sync/state').expect(401);
    await request(app).post('/api/v1/webhooks/sync/import').send(validBatch).expect(401);
  });

  it('rejects an incorrect secret', async () => {
    await request(app)
      .get('/api/v1/webhooks/sync/state')
      .set('X-Webhook-Secret', 'incorrect-secret-value')
      .expect(401);
  });

  it('accepts correct secret + valid payload', async () => {
    await request(app)
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send(validBatch)
      .expect(202);
  });

  it('rejects correct secret + invalid payload', async () => {
    await request(app)
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .send({ mailbox: 'not-an-email', messages: [] })
      .expect(400);
  });

  it('returns safe errors for malformed requests', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/sync/import')
      .set('X-Webhook-Secret', SECRET)
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:/);
  });

  it('validates classification payloads', async () => {
    await request(app)
      .post('/api/v1/webhooks/classification/results')
      .set('X-Webhook-Secret', SECRET)
      .send({ results: [{ emailId: 'not-a-uuid', category: 'nope', priority: 9 }] })
      .expect(400);
  });
});
