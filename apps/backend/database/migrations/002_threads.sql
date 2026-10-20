-- 002: threads (one per Gmail conversation).

CREATE TABLE IF NOT EXISTS threads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_address   text NOT NULL,
  gmail_thread_id   text NOT NULL,
  subject           text NOT NULL DEFAULT '',
  latest_message_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT threads_gmail_thread_id_not_blank CHECK (btrim(gmail_thread_id) <> ''),
  CONSTRAINT threads_mailbox_not_blank CHECK (btrim(mailbox_address) <> '')
);

-- Provider thread id is unique per configured mailbox (not the PK).
CREATE UNIQUE INDEX IF NOT EXISTS threads_mailbox_gmail_unique
  ON threads (normalize_email(mailbox_address), gmail_thread_id);

CREATE INDEX IF NOT EXISTS threads_latest_message_idx ON threads (latest_message_at DESC NULLS LAST);
