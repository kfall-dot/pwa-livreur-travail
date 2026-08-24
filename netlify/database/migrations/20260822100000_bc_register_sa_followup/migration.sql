-- Suivi BC SA : FACTURE / JUSTIFS / OBSERVATION / VÉRIFICATION éditables
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "sa_invoice" text;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "sa_justifs" text;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "sa_observation" text;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "sa_verification" text;
