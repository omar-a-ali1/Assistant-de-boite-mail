/**
 * Environment configuration: loads .env (if present), validates required
 * variables with Joi and fails fast with a sanitized error message.
 * Never logs secret values.
 *
 * @module config/env
 */
const path = require('path');
const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') }); // repo root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // apps/backend/.env override

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: /postgres(ql)?/ })
    .required(),
  BACKEND_PORT: Joi.number().integer().min(1).max(65535).default(4000),
  FRONTEND_PORT: Joi.number().integer().min(1).max(65535).default(5173),
  FRONTEND_ORIGIN: Joi.string().uri({ scheme: /https?/ }).default('http://localhost:5173'),
  SESSION_SECRET: Joi.string().min(16).required(),
  SESSION_COOKIE_NAME: Joi.string().default('usts_sid'),
  N8N_BASE_URL: Joi.string().uri({ scheme: /https?/ }).default('http://localhost:5678'),
  N8N_WEBHOOK_SECRET: Joi.string().min(16).required(),
  N8N_SYNC_WEBHOOK_URL: Joi.string().allow('').uri({ scheme: /https?/ }).default(''),
  N8N_CLASSIFICATION_WEBHOOK_URL: Joi.string().allow('').uri({ scheme: /https?/ }).default(''),
  N8N_SEND_REPLY_WEBHOOK_URL: Joi.string().allow('').uri({ scheme: /https?/ }).default(''),
  AI_PROVIDER: Joi.string().valid('groq', 'mock').default('mock'),
  AI_API_KEY: Joi.string().allow('').default(''),
  AI_MODEL: Joi.string().default('llama-3.3-70b-versatile'),
  AI_BASE_URL: Joi.string().uri({ scheme: /https?/ }).default('https://api.groq.com/openai/v1'),
  GMAIL_CLIENT_ID: Joi.string().allow('').default(''),
  GMAIL_CLIENT_SECRET: Joi.string().allow('').default(''),
  GMAIL_REDIRECT_URI: Joi.string().uri({ scheme: /https?/ }).allow('').default(''),
  MAILBOX_ADDRESS: Joi.string().email().default('demo@example.com'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
})
  .unknown(true) // ignore unrelated OS/shell variables
  .required();

const { error, value: env } = schema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
});

if (error) {
  // Only variable NAMES are reported — never values.
  const names = error.details.map((d) => d.path.join('.')).join(', ');
  // eslint-disable-next-line no-console
  console.error(
    `[config] Invalid environment configuration. Check these variables: ${names}. See .env.example.`
  );
  process.exit(1);
}

const isProduction = env.NODE_ENV === 'production';
const isTest = env.NODE_ENV === 'test';

module.exports = {
  env: env.NODE_ENV,
  isProduction,
  isTest,
  port: env.BACKEND_PORT,
  frontendPort: env.FRONTEND_PORT,
  frontendOrigin: env.FRONTEND_ORIGIN,
  databaseUrl: env.DATABASE_URL,
  session: {
    secret: env.SESSION_SECRET,
    cookieName: env.SESSION_COOKIE_NAME,
  },
  n8n: {
    baseUrl: env.N8N_BASE_URL,
    webhookSecret: env.N8N_WEBHOOK_SECRET,
    syncWebhookUrl: env.N8N_SYNC_WEBHOOK_URL,
    classificationWebhookUrl: env.N8N_CLASSIFICATION_WEBHOOK_URL,
    sendReplyWebhookUrl: env.N8N_SEND_REPLY_WEBHOOK_URL,
  },
  ai: {
    provider: env.AI_PROVIDER,
    apiKey: env.AI_API_KEY,
    model: env.AI_MODEL,
    baseUrl: env.AI_BASE_URL,
  },
  gmail: {
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
    redirectUri: env.GMAIL_REDIRECT_URI,
  },
  mailboxAddress: env.MAILBOX_ADDRESS,
  logLevel: env.LOG_LEVEL,
};
