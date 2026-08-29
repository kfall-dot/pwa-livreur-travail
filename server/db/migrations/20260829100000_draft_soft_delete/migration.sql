-- Suppression logique des brouillons d'EB (DT) : statut 'deleted' + traçabilité
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'deleted';

ALTER TABLE "purchase_request_drafts"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

ALTER TABLE "purchase_request_drafts"
  ADD COLUMN IF NOT EXISTS "deleted_by_id" text REFERENCES "managers"("id");
