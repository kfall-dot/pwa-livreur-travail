ALTER TYPE purchase_request_status ADD VALUE IF NOT EXISTS 'correction_required';
ALTER TYPE purchase_request_status ADD VALUE IF NOT EXISTS 'correction_head_review';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS correction_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS correction_target_id text REFERENCES managers(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS correction_pending boolean NOT NULL DEFAULT false;
ALTER TABLE approval_steps ADD COLUMN IF NOT EXISTS invalidated_at timestamp;
CREATE TABLE IF NOT EXISTS procurement_corrections (
 id text PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id), request_id text NOT NULL REFERENCES purchase_requests(id),
 requested_by_id text NOT NULL REFERENCES managers(id), target_manager_id text NOT NULL REFERENCES managers(id),
 target_role text NOT NULL, kind text NOT NULL CHECK(kind IN ('need','commercial','documents','bc')), reason text NOT NULL,
 from_status text NOT NULL, state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','head_review','resubmitted','closed')),
 source_version integer NOT NULL, snapshot jsonb NOT NULL, uploaded_keys jsonb NOT NULL DEFAULT '[]',
 resume_status text, response_comment text, created_at timestamp NOT NULL DEFAULT now(), resubmitted_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS procurement_corrections_open_uidx ON procurement_corrections(request_id) WHERE state IN ('open','head_review');
CREATE INDEX IF NOT EXISTS procurement_corrections_recipient_idx ON procurement_corrections(company_id,target_manager_id,state);
