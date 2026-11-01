CREATE TABLE IF NOT EXISTS notification_outbox (
 id text PRIMARY KEY,
 company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 notification_id text REFERENCES notifications(id) ON DELETE SET NULL,
 channel text NOT NULL CHECK (channel IN ('email','sms')),
 payload jsonb NOT NULL,
 dedupe_key text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 claim_token text,
 test_only boolean NOT NULL DEFAULT false,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 UNIQUE(company_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status,next_attempt_at);
