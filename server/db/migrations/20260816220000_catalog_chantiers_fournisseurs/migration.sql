-- Catalogue : type de chantier (Privé / Public) + fiche fournisseur étendue
ALTER TABLE "supermarkets" ADD COLUMN IF NOT EXISTS "site_type" text NOT NULL DEFAULT 'prive';

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "contact_name" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "depot_address" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "family" text;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "notes" text;
