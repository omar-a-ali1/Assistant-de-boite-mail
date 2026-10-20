-- 006: synchronization state (durable cursor) and sync run history.

-- Single-row mailbox checkpoint. The cursor is advanced only after a
-- batch has been accepted and committed by the backend.
CREATE TABLE IF NOT EXISTS sync_state (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_address  text NOT NULL,
  cursor           text,
  cursor_updated_at timestamptz,
  last_sync_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sync_state_mailbox_not_blank CHECK (btrim(mailbox_address) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_state_mailbox_unique
  ON sync_state (normalize_email(mailbox_address));

CREATE TABLE IF NOT EXISTS sync_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_address   text NOT NULL,
  status            text NOT NULL DEFAULT 'RUNNING',
  cursor_start      text,
  cursor_end        text,
  imported_count    integer NOT NULL DEFAULT 0,
  updated_count     integer NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  error_code        text,
  error_message     text,
  execution_id      text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sync_runs_status_valid CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS sync_runs_started_idx ON sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx ON sync_runs (status);
