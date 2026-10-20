-- 005: idempotency records + replies (durable outbox state machine).

-- Durable operation tracking: an idempotency key maps to exactly one
-- logical operation. Reusing a key with a different payload is rejected.
CREATE TABLE IF NOT EXISTS idempotency_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     text NOT NULL,
  operation_type      text NOT NULL,
  resource_type       text NOT NULL,
  resource_id         uuid,
  request_fingerprint text NOT NULL,
  status              text NOT NULL DEFAULT 'IN_PROGRESS',
  result_reference    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idempotency_key_not_blank CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT idempotency_status_valid CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  CONSTRAINT idempotency_key_op_unique UNIQUE (idempotency_key, operation_type)
);

CREATE INDEX IF NOT EXISTS idempotency_resource_idx
  ON idempotency_records (resource_type, resource_id);

-- Replies / delivery outbox.
CREATE TABLE IF NOT EXISTS replies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id           uuid NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  original_email_id   uuid NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  draft_id            uuid REFERENCES drafts (id) ON DELETE SET NULL,
  idempotency_key     text NOT NULL,
  body                text NOT NULL,
  status              text NOT NULL DEFAULT 'PENDING',
  provider_message_id text,
  error_code          text,
  error_message       text,
  attempt_count       integer NOT NULL DEFAULT 0,
  last_attempt_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  CONSTRAINT replies_status_valid CHECK (
    status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN')
  ),
  CONSTRAINT replies_body_not_blank CHECK (btrim(body) <> ''),
  CONSTRAINT replies_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS replies_thread_idx ON replies (thread_id);
CREATE INDEX IF NOT EXISTS replies_status_idx ON replies (status);
CREATE INDEX IF NOT EXISTS replies_original_email_idx ON replies (original_email_id);
