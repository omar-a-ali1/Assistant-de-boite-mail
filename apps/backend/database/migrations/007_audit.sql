-- 007: audit events (operational traceability, no sensitive payloads).

CREATE TABLE IF NOT EXISTS audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text NOT NULL,
  actor        text,
  resource_type text,
  resource_id  uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_type_idx ON audit_events (event_type);
