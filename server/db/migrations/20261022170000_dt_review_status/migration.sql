-- Les EB soumises par le Chef de chantier attendent la validation du DT.
-- Le statut existe dans le schéma applicatif mais manquait aux migrations SQL.
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'dt_review' BEFORE 'submitted';
