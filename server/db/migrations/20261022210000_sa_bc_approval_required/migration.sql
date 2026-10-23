-- Répare les installations ayant déjà appliqué sa_team_review avant l'ajout
-- de ce marqueur. Ne pas dépendre d'une réexécution de l'ancienne migration.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS sa_approval_required boolean NOT NULL DEFAULT false;
