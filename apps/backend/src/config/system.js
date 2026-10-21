/**
 * System-wide constants shared across the backend.
 *
 * @module config/system
 */

/** Canonical HTTP error codes / messages used in API responses. */
const HTTP_REQUESTS = {
  400: { code: 'VALIDATION_ERROR', message: 'The request is invalid.' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
  403: { code: 'FORBIDDEN', message: 'You do not have access to this resource.' },
  404: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  409: { code: 'CONFLICT', message: 'The request conflicts with the current state of the resource.' },
  422: { code: 'UNPROCESSABLE', message: 'The request could not be processed.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.' },
  500: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  502: { code: 'UPSTREAM_ERROR', message: 'An upstream service returned an error.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
};

/** Allowed email categories (shared with AI validation and frontend labels). */
const EMAIL_CATEGORIES = ['client', 'facture', 'rendez-vous', 'newsletter', 'spam probable', 'autre'];

/** Allowed email processing statuses. */
const PROCESSING_STATUSES = ['TO_PROCESS', 'DRAFT_READY', 'REPLIED', 'IGNORED'];

/** Allowed reply delivery statuses (outbox state machine). */
const REPLY_STATUSES = ['PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN'];

/** Allowed draft tones. */
const DRAFT_TONES = ['formal', 'neutral', 'short'];

/** Gmail App Password bounds (Google issues 16, spaces are ignored). */
const APP_PASSWORD_MIN_LENGTH = 8;
const APP_PASSWORD_MAX_LENGTH = 64;

/** Allowed sync run / sync state statuses. */
const SYNC_STATUSES = ['RUNNING', 'SUCCESS', 'FAILED'];

/**
 * Priority meaning (documented for API + UI + AI contract):
 * 1 = low, 2 = medium, 3 = high.
 */
const PRIORITY_LEVELS = { 1: 'low', 2: 'medium', 3: 'high' };

module.exports = {
  HTTP_REQUESTS,
  EMAIL_CATEGORIES,
  PROCESSING_STATUSES,
  REPLY_STATUSES,
  DRAFT_TONES,
  APP_PASSWORD_MIN_LENGTH,
  APP_PASSWORD_MAX_LENGTH,
  SYNC_STATUSES,
  PRIORITY_LEVELS,
};
