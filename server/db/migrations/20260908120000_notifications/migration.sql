-- Ajout phone dans managers + table notifications pour alertes in-app/SMS

ALTER TABLE managers
  ADD COLUMN IF NOT EXISTS phone text;

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'approval_required',
    'bc_to_validate',
    'bt_to_validate',
    'task_assigned',
    'delivery_issue',
    'budget_alert'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  company_id text NOT NULL REFERENCES companies(id),
  manager_id text NOT NULL REFERENCES managers(id),
  type notification_type NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  ref_type text,
  ref_id text,
  sms_sent boolean NOT NULL DEFAULT false,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_manager_read
  ON notifications (manager_id, read, created_at DESC);
