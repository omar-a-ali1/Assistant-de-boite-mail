/**
 * Outbound calls to n8n workflow webhooks. The backend is the only
 * component allowed to invoke n8n; the browser never does.
 *
 * Applies: shared-secret header, timeouts, and safe error handling.
 *
 * @module services/n8n.service
 */
const config = require('../config/env');
const logger = require('../utils/logger');

const DEFAULT_TIMEOUT_MS = 10_000;

async function post(url, payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!url) {
    return { ok: false, skipped: true, reason: 'webhook_not_configured' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': config.n8n.webhookSecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      logger.warn('n8n_webhook_failed', { status: res.status });
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status, body: text };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    logger.warn('n8n_webhook_error', { code: aborted ? 'TIMEOUT' : err.code || 'NETWORK' });
    return { ok: false, error: aborted ? 'TIMEOUT' : 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

/** Trigger the reply-sending workflow for an approved reply. */
async function triggerSendReply(payload) {
  return post(config.n8n.sendReplyWebhookUrl, payload);
}

/** Trigger an on-demand email sync (optional, workflow is also scheduled). */
async function triggerSync(payload = {}) {
  return post(config.n8n.syncWebhookUrl, payload);
}

/** Trigger classification of pending emails (optional, workflow polls). */
async function triggerClassification(payload = {}) {
  return post(config.n8n.classificationWebhookUrl, payload);
}

module.exports = { post, triggerSendReply, triggerSync, triggerClassification };
