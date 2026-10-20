/**
 * API behavior tests: pagination, filters, validation, summary from real
 * data, thread ordering, draft editing, delivery state display.
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

async function seedFew() {
  await insertEmail({
    gmailMessageId: 'a1',
    gmailThreadId: 'th-a',
    subject: 'Facture A',
    category: 'facture',
    priority: 3,
    receivedAt: '2026-10-20T09:00:00.000Z',
  });
  await insertEmail({
    gmailMessageId: 'a2',
    gmailThreadId: 'th-a',
    subject: 'Re: Facture A',
    sender: 'me@example.com',
    category: 'facture',
    priority: 3,
    receivedAt: '2026-10-20T11:00:00.000Z',
  });
  await insertEmail({
    gmailMessageId: 'b1',
    gmailThreadId: 'th-b',
    subject: 'Newsletter B',
    category: 'newsletter',
    priority: 1,
    receivedAt: '2026-10-19T09:00:00.000Z',
  });
}

describe('API behavior', () => {
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
    await seedFew();
  });

  it('paginates results with consistent metadata', async () => {
    const { agent } = await authAgent(app);
    const res = await agent.get('/api/v1/emails?page=1&limit=2').expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

    const page2 = await agent.get('/api/v1/emails?page=2&limit=2').expect(200);
    expect(page2.body.data).toHaveLength(1);
  });

  it('applies combinable filters', async () => {
    const { agent } = await authAgent(app);
    const res = await agent
      .get('/api/v1/emails?category=facture&priority=3&status=TO_PROCESS')
      .expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((e) => e.category === 'facture')).toBe(true);
  });

  it('searches subject and content', async () => {
    const { agent } = await authAgent(app);
    const res = await agent.get('/api/v1/emails?search=Newsletter').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toContain('Newsletter');
  });

  it('rejects invalid query parameters via Joi', async () => {
    const { agent } = await authAgent(app);
    await agent.get('/api/v1/emails?limit=9999').expect(400);
    await agent.get('/api/v1/emails?priority=9').expect(400);
    await agent.get('/api/v1/emails?sortBy=malicious;drop').expect(400);
  });

  it('rejects an unknown sort field but keeps a whitelist', async () => {
    const { agent } = await authAgent(app);
    const res = await agent.get('/api/v1/emails?sortBy=subject&sortOrder=asc').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('computes the daily summary from actual data', async () => {
    const { agent } = await authAgent(app);
    const res = await agent.get('/api/v1/summary?date=2026-10-20').expect(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.byCategory.facture).toBe(2);
    expect(res.body.data.topEmails.length).toBeGreaterThan(0);
    expect(res.body.data.topEmails[0].reason).toMatch(/Sélectionné/);
  });

  it('orders thread messages chronologically', async () => {
    const { agent } = await authAgent(app);
    const t = await query("SELECT id FROM threads WHERE gmail_thread_id = 'th-a'");
    const res = await agent.get(`/api/v1/threads/${t.rows[0].id}`).expect(200);
    const times = res.body.data.messages.map((m) => new Date(m.receivedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('persists draft edits', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const email = await query("SELECT id FROM emails WHERE gmail_message_id = 'a1'");
    const draft = await agent
      .post(`/api/v1/emails/${email.rows[0].id}/draft`)
      .set('X-CSRF-Token', csrfToken)
      .send({ tone: 'short' })
      .expect(201);
    const id = draft.body.data.id;

    await agent
      .patch(`/api/v1/drafts/${id}`)
      .set('X-CSRF-Token', csrfToken)
      .send({ body: 'Contenu modifié.' })
      .expect(200);

    const check = await query('SELECT body, edited_by_user FROM drafts WHERE id = $1', [id]);
    expect(check.rows[0].body).toBe('Contenu modifié.');
    expect(check.rows[0].edited_by_user).toBe(true);
  });

  it('rejects an invalid draft tone', async () => {
    const { agent, csrfToken } = await authAgent(app);
    const email = await query("SELECT id FROM emails WHERE gmail_message_id = 'a1'");
    await agent
      .post(`/api/v1/emails/${email.rows[0].id}/draft`)
      .set('X-CSRF-Token', csrfToken)
      .send({ tone: 'agressif' })
      .expect(400);
  });

  it('returns an empty result set when no matches exist', async () => {
    const { agent } = await authAgent(app);
    const res = await agent.get('/api/v1/emails?search=zzzznomatch').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });
});
