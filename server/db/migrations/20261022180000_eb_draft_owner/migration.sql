ALTER TABLE purchase_request_drafts
  ADD COLUMN IF NOT EXISTS created_by_manager_id text REFERENCES managers(id);

-- Récupérer l'initiateur historique depuis les traces de création.
UPDATE purchase_request_drafts d
SET created_by_manager_id = m.id
FROM eb_parse_runs p, managers m
WHERE p.draft_id = d.id
  AND p.extracted_json->>'createdByManagerId' = m.id
  AND m.company_id = d.company_id
  AND d.created_by_manager_id IS NULL;

UPDATE purchase_request_drafts d
SET created_by_manager_id = m.id
FROM whatsapp_messages w, managers m
WHERE d.source_message_ids @> jsonb_build_array(w.id)
  AND w.raw_payload->>'pastedByManagerId' = m.id
  AND w.company_id = d.company_id
  AND m.company_id = d.company_id
  AND d.created_by_manager_id IS NULL;

CREATE INDEX IF NOT EXISTS purchase_request_drafts_creator_idx
  ON purchase_request_drafts(company_id, created_by_manager_id);
