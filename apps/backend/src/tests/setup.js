/**
 * Vitest global setup: force the test environment onto an isolated
 * database (DATABASE_URL_TEST) and run migrations once.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Isolated test database — never the development database.
if (!process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL_TEST =
    'postgresql://usts:usts_dev_password@localhost:5433/usts_email_test';
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-0123456789';
process.env.N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || 'test-webhook-secret-0123456789';
process.env.AI_PROVIDER = 'mock';
// Tests must never reach a real n8n instance from the host.
process.env.N8N_SYNC_WEBHOOK_URL = '';
process.env.N8N_CLASSIFICATION_WEBHOOK_URL = '';
process.env.N8N_SEND_REPLY_WEBHOOK_URL = '';
