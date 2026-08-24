-- Catégorie de dépense par ligne EB (ventilation CdG vs budget total)
ALTER TABLE "purchase_request_lines"
  ADD COLUMN IF NOT EXISTS "spend_category" text NOT NULL DEFAULT 'materiaux';
