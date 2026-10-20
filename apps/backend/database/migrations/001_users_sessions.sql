-- 001: users, sessions, mailbox identity and normalization helpers.
-- Single-mailbox assumption for v1; schema stays extensible via mailbox_address.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Normalizes an email address for storage/lookup.
CREATE OR REPLACE FUNCTION normalize_email(value text)
RETURNS text AS $$
  SELECT lower(btrim(value));
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  display_name  text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_not_blank CHECK (btrim(email) <> ''),
  CONSTRAINT users_password_hash_not_blank CHECK (btrim(password_hash) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (normalize_email(email));

-- Connect-pg-simple compatible session table.
CREATE TABLE IF NOT EXISTS sessions (
  sid    varchar NOT NULL COLLATE "default",
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL,
  CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions (expire);
