-- 003: emails (individual messages) + classification fields.

CREATE TABLE IF NOT EXISTS emails (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_address    text NOT NULL,
  gmail_message_id   text NOT NULL,
  thread_id          uuid NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  sender             text NOT NULL,
  recipients         jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject            text NOT NULL DEFAULT '',
  body_text          text NOT NULL DEFAULT '',
  received_at        timestamptz NOT NULL,
  category           text,
  priority           smallint,
  summary            text,
  expected_action    text,
  needs_review       boolean NOT NULL DEFAULT false,
  processing_status  text NOT NULL DEFAULT 'TO_PROCESS',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emails_gmail_message_id_not_blank CHECK (btrim(gmail_message_id) <> ''),
  CONSTRAINT emails_category_valid CHECK (
    category IS NULL OR category IN
      ('client', 'facture', 'rendez-vous', 'newsletter', 'spam probable', 'autre')
  ),
  CONSTRAINT emails_priority_range CHECK (priority IS NULL OR priority BETWEEN 1 AND 3),
  CONSTRAINT emails_status_valid CHECK (
    processing_status IN ('TO_PROCESS', 'DRAFT_READY', 'REPLIED', 'IGNORED')
  )
);

-- Import dedup key: Gmail message id unique per mailbox.
CREATE UNIQUE INDEX IF NOT EXISTS emails_mailbox_gmail_unique
  ON emails (normalize_email(mailbox_address), gmail_message_id);

CREATE INDEX IF NOT EXISTS emails_thread_idx ON emails (thread_id, received_at);
CREATE INDEX IF NOT EXISTS emails_received_idx ON emails (received_at DESC);
CREATE INDEX IF NOT EXISTS emails_category_idx ON emails (category);
CREATE INDEX IF NOT EXISTS emails_priority_idx ON emails (priority);
CREATE INDEX IF NOT EXISTS emails_status_idx ON emails (processing_status);
CREATE INDEX IF NOT EXISTS emails_needs_review_idx ON emails (needs_review) WHERE needs_review;
-- Full-text search over subject + body (used by GET /emails?search=).
CREATE INDEX IF NOT EXISTS emails_search_idx
  ON emails USING gin (to_tsvector('french', coalesce(subject, '') || ' ' || coalesce(body_text, '')));
