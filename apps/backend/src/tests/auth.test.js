/**
 * Authentication & session security tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
const request = require('supertest');
const {
  prepareDatabase,
  truncateAll,
  ensureTestUser,
  insertEmail,
  createApp,
  query,
  TEST_EMAIL,
  TEST_PASSWORD,
} = require('./helpers');
const { closePool } = require('../config/db');

let app;

describe('authentication', () => {
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

  it('rejects unauthenticated private requests', async () => {
    await request(app).get('/api/v1/emails').expect(401);
    await request(app).get('/api/v1/summary?date=2026-10-20').expect(401);
    await request(app).get('/api/v1/threads/00000000-0000-4000-8000-000000000000').expect(401);
  });

  it('rejects invalid credentials with a generic message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrong-password' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects unknown users with the same generic message', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('creates a session on successful login and sets a secure cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.csrfToken).toBeTruthy();
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('registers a new account and opens a session without CSRF', async () => {
    const agent = request.agent(app);
    const res = await agent
      .post('/api/v1/auth/register')
      .send({
        email: 'New.User@Example.com',
        password: 'new-password-123',
        displayName: 'New User',
      })
      .expect(201);

    expect(res.body.data.user.email).toBe('new.user@example.com');
    expect(res.body.data.user.displayName).toBe('New User');
    expect(res.body.data.csrfToken).toBeTruthy();
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user.email).toBe('new.user@example.com');

    await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', res.body.data.csrfToken)
      .expect(200);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: 'new.user@example.com', password: 'new-password-123' })
      .expect(200);
    expect(login.body.data.user.email).toBe('new.user@example.com');

    const stored = await query(
      'SELECT password_hash FROM users WHERE normalize_email(email) = normalize_email($1)',
      ['new.user@example.com']
    );
    expect(stored.rows[0].password_hash).not.toBe('new-password-123');
    expect(stored.rows[0].password_hash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects duplicate registration case-insensitively', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'duplicate@example.com', password: 'password-1234' })
      .expect(201);

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'DUPLICATE@EXAMPLE.COM', password: 'another-password' })
      .expect(409);

    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects invalid registration input', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('returns the authenticated user from /auth/me', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.data.user.email).toBe(TEST_EMAIL);
  });

  it('invalidates the session on logout', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    await agent
      .post('/api/v1/auth/logout')
      .set('X-CSRF-Token', login.body.data.csrfToken)
      .expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('regenerates the session id after login', async () => {
    const agent = request.agent(app);
    const first = await agent
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    const firstSid = first.headers['set-cookie'][0];
    const second = await agent
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);
    const secondSid = second.headers['set-cookie'][0];
    expect(firstSid).not.toBe(secondSid);
  });

  it('enforces CSRF protection on state-changing routes', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    const { emailId } = await insertEmail();
    await agent
      .post(`/api/v1/emails/${emailId}/reply`)
      .set('Idempotency-Key', 'csrf-test-key-123456')
      .send({ body: 'x', confirm: true })
      .expect(403);
  });
});
