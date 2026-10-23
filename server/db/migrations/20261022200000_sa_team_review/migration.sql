ALTER TYPE purchase_request_status ADD VALUE IF NOT EXISTS 'sa_head_review';
ALTER TYPE purchase_request_status ADD VALUE IF NOT EXISTS 'bc_head_review';
ALTER TABLE managers ADD COLUMN IF NOT EXISTS sa_supervisor_id text REFERENCES managers(id);
ALTER TABLE managers ADD CONSTRAINT managers_sa_not_self CHECK (sa_supervisor_id IS NULL OR sa_supervisor_id <> id);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sa_reviewer_id text REFERENCES managers(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_head_signature text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_approval_required boolean NOT NULL DEFAULT false;
