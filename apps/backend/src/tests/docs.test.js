/**
 * API documentation contract tests: the OpenAPI document must stay
 * parseable and expose the documented route modules.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const request = require('supertest');
const createApp = require('../app');
const { closePool } = require('../config/db');

let app;

describe('API documentation', () => {
  beforeAll(() => {
    app = createApp();
  });

  afterAll(async () => {
    await closePool();
  });

  it('serves a valid OpenAPI document', async () => {
    const res = await request(app).get('/api/docs.json').expect(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.info.title).toContain('Assistant');
    expect(res.body.servers[0].url).toBe('/api/v1');
  });

  it('documents the split route modules and webhooks', async () => {
    const res = await request(app).get('/api/docs.json').expect(200);
    const paths = Object.keys(res.body.paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/auth/me',
        '/emails',
        '/summary',
        '/threads/{id}',
        '/emails/{id}/draft',
        '/drafts/{id}',
        '/emails/{id}/reply',
        '/replies/{id}',
        '/replies/{id}/retry',
        '/webhooks/sync/import',
        '/webhooks/reply/outcome',
      ])
    );

    expect(res.body.paths['/emails/{id}/reply'].post.security).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ idempotencyKey: [] }),
      ])
    );
  });

  it('serves the Swagger UI', async () => {
    const res = await request(app).get('/api/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });
});
