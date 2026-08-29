-- Audit sécurité + 2FA admin (TOTP)

CREATE TABLE IF NOT EXISTS security_audit_events (
  id text PRIMARY KEY,
  company_id text REFERENCES companies(id),
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  metadata jsonb,
  ip text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_events_created_at_idx ON security_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_events_company_id_idx ON security_audit_events (company_id);

ALTER TABLE managers ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE managers ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
