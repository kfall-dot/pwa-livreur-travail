-- Compatible avec la première version de la table de corrections.
ALTER TABLE procurement_corrections ADD COLUMN IF NOT EXISTS target_role text;
UPDATE procurement_corrections c SET target_role=m.procurement_role::text FROM managers m WHERE m.id=c.target_manager_id AND c.target_role IS NULL;
ALTER TABLE procurement_corrections ALTER COLUMN target_role SET NOT NULL;
ALTER TABLE procurement_corrections ADD COLUMN IF NOT EXISTS resume_status text;
ALTER TABLE procurement_corrections DROP CONSTRAINT IF EXISTS procurement_corrections_state_check;
ALTER TABLE procurement_corrections ADD CONSTRAINT procurement_corrections_state_check CHECK(state IN ('open','head_review','resubmitted','closed'));
DROP INDEX IF EXISTS procurement_corrections_open_uidx;
CREATE UNIQUE INDEX procurement_corrections_open_uidx ON procurement_corrections(request_id) WHERE state IN ('open','head_review');
