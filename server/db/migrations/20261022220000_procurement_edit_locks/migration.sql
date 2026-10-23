CREATE TABLE IF NOT EXISTS procurement_edit_locks (
  company_id text NOT NULL REFERENCES companies(id),
  document_kind text NOT NULL CHECK (document_kind IN ('drafts', 'requests')),
  document_id text NOT NULL,
  manager_id text NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, document_kind, document_id)
);
