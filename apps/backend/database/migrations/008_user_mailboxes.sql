-- 008: per-user Gmail mailboxes and strict data isolation.
-- Existing single-mailbox demo data is assigned to the oldest user so it
-- remains visible only to that account.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mailbox_address text,
  ADD COLUMN IF NOT EXISTS gmail_app_password_encrypted text,
  ADD COLUMN IF NOT EXISTS gmail_verified_at timestamptz;

UPDATE users
SET mailbox_address = email
WHERE mailbox_address IS NULL;

ALTER TABLE users
  ALTER COLUMN mailbox_address SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_mailbox_unique
  ON users (normalize_email(mailbox_address));

ALTER TABLE threads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE idempotency_records ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users (id) ON DELETE CASCADE;

-- Backfill every pre-existing row to the oldest account (the demo account
-- in a seeded database) before enforcing NOT NULL where possible.
DO $$
DECLARE
  owner_id uuid;
BEGIN
  SELECT id INTO owner_id FROM users ORDER BY created_at ASC LIMIT 1;
  IF owner_id IS NOT NULL THEN
    UPDATE threads SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE emails SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE drafts SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE replies SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE idempotency_records SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE sync_state SET user_id = owner_id WHERE user_id IS NULL;
    UPDATE sync_runs SET user_id = owner_id WHERE user_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM threads WHERE user_id IS NULL) THEN
    ALTER TABLE threads ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM emails WHERE user_id IS NULL) THEN
    ALTER TABLE emails ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM drafts WHERE user_id IS NULL) THEN
    ALTER TABLE drafts ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM replies WHERE user_id IS NULL) THEN
    ALTER TABLE replies ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM idempotency_records WHERE user_id IS NULL) THEN
    ALTER TABLE idempotency_records ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sync_state WHERE user_id IS NULL) THEN
    ALTER TABLE sync_state ALTER COLUMN user_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sync_runs WHERE user_id IS NULL) THEN
    ALTER TABLE sync_runs ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- Provider identifiers are unique per user, not per mailbox address.
DROP INDEX IF EXISTS threads_mailbox_gmail_unique;
CREATE UNIQUE INDEX IF NOT EXISTS threads_user_gmail_unique
  ON threads (user_id, gmail_thread_id);

DROP INDEX IF EXISTS emails_mailbox_gmail_unique;
CREATE UNIQUE INDEX IF NOT EXISTS emails_user_gmail_unique
  ON emails (user_id, gmail_message_id);

DROP INDEX IF EXISTS sync_state_mailbox_unique;
CREATE UNIQUE INDEX IF NOT EXISTS sync_state_user_unique
  ON sync_state (user_id);

ALTER TABLE replies DROP CONSTRAINT IF EXISTS replies_idempotency_key_unique;
CREATE UNIQUE INDEX IF NOT EXISTS replies_user_idempotency_unique
  ON replies (user_id, idempotency_key);

ALTER TABLE idempotency_records DROP CONSTRAINT IF EXISTS idempotency_key_op_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_user_key_op_unique
  ON idempotency_records (user_id, idempotency_key, operation_type);

CREATE INDEX IF NOT EXISTS threads_user_idx ON threads (user_id, latest_message_at DESC);
CREATE INDEX IF NOT EXISTS emails_user_idx ON emails (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS drafts_user_idx ON drafts (user_id, thread_id);
CREATE INDEX IF NOT EXISTS replies_user_idx ON replies (user_id, thread_id);
CREATE INDEX IF NOT EXISTS idempotency_user_idx ON idempotency_records (user_id);
CREATE INDEX IF NOT EXISTS sync_runs_user_idx ON sync_runs (user_id, started_at DESC);
