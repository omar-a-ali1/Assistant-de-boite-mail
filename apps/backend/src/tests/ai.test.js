/**
 * AI classification tests: valid JSON accepted; invalid JSON retried;
 * persistent invalid output falls back to `autre` + needs review; the
 * Joi schema rejects bad categories and out-of-range priorities; rate
 * limit (429) errors follow the retry policy.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
const { prepareDatabase } = require('./helpers');
const { closePool } = require('../config/db');
const aiService = require('../services/ai.service');
const { aiClassificationOutput } = require('../validation/schemas');

const sampleEmail = {
  subject: 'Facture impayée',
  bodyText: 'Merci de régler la facture F-2026-0042.',
  sender: 'compta@example.com',
};

/** Helper: replace global.fetch with a scripted sequence. */
function mockFetchSequence(responses) {
  let i = 0;
  global.fetch = vi.fn(async () => {
    const spec = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (spec instanceof Error) throw spec;
    return {
      ok: spec.status >= 200 && spec.status < 300,
      status: spec.status,
      json: async () => ({ choices: [{ message: { content: spec.content } }] }),
      text: async () => spec.content || '',
    };
  });
  return () => i;
}

describe('AI classification', () => {
  const originalProvider = process.env.AI_PROVIDER;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    await prepareDatabase();
  });
  afterAll(async () => {
    process.env.AI_PROVIDER = originalProvider;
    global.fetch = originalFetch;
    await closePool();
  });

  beforeEach(() => {
    // Route every call through the networked (Groq) code path so the
    // scripted fetch mock is exercised.
    process.env.AI_PROVIDER = 'groq';
  });

  it('accepts a valid classification output', async () => {
    mockFetchSequence([
      {
        status: 200,
        content: JSON.stringify({
          category: 'facture',
          priority: 3,
          summary: 'Facture à régler.',
          expectedAction: 'Régler la facture.',
        }),
      },
    ]);
    const result = await aiService.generateClassification(sampleEmail);
    expect(['client', 'facture', 'rendez-vous', 'newsletter', 'spam probable', 'autre']).toContain(
      result.category
    );
    expect(result.priority).toBeGreaterThanOrEqual(1);
    expect(result.priority).toBeLessThanOrEqual(3);
    expect(result.needsReview).toBe(false);
  });

  it('accepts valid JSON from the provider', async () => {
    mockFetchSequence([
      {
        status: 200,
        content: JSON.stringify({
          category: 'facture',
          priority: 3,
          summary: 'Facture à régler.',
          expectedAction: 'Régler la facture.',
        }),
      },
    ]);
    const result = await aiService.generateClassification(sampleEmail);
    expect(result.category).toBe('facture');
    expect(result.priority).toBe(3);
    expect(result.needsReview).toBe(false);
  });

  it('retries once on invalid JSON and then succeeds', async () => {
    const calls = mockFetchSequence([
      { status: 200, content: 'not json at all' },
      {
        status: 200,
        content: JSON.stringify({
          category: 'client',
          priority: 2,
          summary: 'Demande client.',
          expectedAction: 'Répondre.',
        }),
      },
    ]);
    const result = await aiService.generateClassification(sampleEmail);
    expect(result.category).toBe('client');
    expect(result.needsReview).toBe(false);
    expect(calls()).toBeGreaterThanOrEqual(2);
  });

  it('falls back to "autre" + needs review after persistent invalid output', async () => {
    mockFetchSequence([{ status: 200, content: 'still not json' }]);
    const result = await aiService.generateClassification(sampleEmail);
    expect(result.category).toBe('autre');
    expect(result.needsReview).toBe(true);
    expect(result.source).toBe('fallback');
  });

  it('rejects invalid categories via the Joi output schema', () => {
    const { error } = aiClassificationOutput.validate({
      category: 'inconnue',
      priority: 2,
      summary: 'résumé',
      expectedAction: 'agir',
    });
    expect(error).toBeTruthy();
  });

  it('rejects out-of-range priorities via the Joi output schema', () => {
    const { error } = aiClassificationOutput.validate({
      category: 'client',
      priority: 9,
      summary: 'résumé',
      expectedAction: 'agir',
    });
    expect(error).toBeTruthy();
  });

  it('treats HTTP 429 as retryable and falls back safely if it persists', async () => {
    const calls = mockFetchSequence([{ status: 429, content: '' }]);
    const result = await aiService.generateClassification(sampleEmail);
    expect(result.needsReview).toBe(true);
    expect(calls()).toBeGreaterThanOrEqual(2);
  });

  it('parses JSON loosely from noisy model output', () => {
    const parsed = aiService.parseJsonLoose('here is the answer: {"category":"client","priority":3}');
    expect(parsed).toEqual({ category: 'client', priority: 3 });
    expect(aiService.parseJsonLoose('no json here')).toBeNull();
  });
});
