-- 004: drafts (AI or manual reply drafts; never sent automatically).

CREATE TABLE IF NOT EXISTS drafts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         uuid NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  original_email_id uuid NOT NULL REFERENCES emails (id) ON DELETE CASCADE,
  body              text NOT NULL,
  tone              text NOT NULL,
  edited_by_user    boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drafts_tone_valid CHECK (tone IN ('formal', 'neutral', 'short')),
  CONSTRAINT drafts_body_not_blank CHECK (btrim(body) <> '')
);

CREATE INDEX IF NOT EXISTS drafts_thread_idx ON drafts (thread_id);
CREATE INDEX IF NOT EXISTS drafts_original_email_idx ON drafts (original_email_id);
