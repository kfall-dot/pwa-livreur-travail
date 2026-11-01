CREATE TABLE IF NOT EXISTS management_statements (
 id text PRIMARY KEY,
 company_id text NOT NULL REFERENCES companies(id),
 month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 version integer NOT NULL CHECK (version > 0),
 snapshot jsonb NOT NULL,
 source_hash text NOT NULL,
 validated_by_manager_id text NOT NULL REFERENCES managers(id),
 validated_by_name text NOT NULL,
 validated_at timestamptz NOT NULL DEFAULT now(),
 comment text NOT NULL DEFAULT '',
 UNIQUE(company_id, month, version)
);
