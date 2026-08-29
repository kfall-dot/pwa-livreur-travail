-- F01.1 — enveloppe chantier (budget initial + avenants) + rôle CdG
ALTER TYPE "procurement_role" ADD VALUE IF NOT EXISTS 'controle_gestion';

DO $$ BEGIN
  CREATE TYPE "site_budget_amendment_status" AS ENUM ('draft', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "supermarket_id" text;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "budget_initial_fcfa" numeric(14, 0);
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "budget_frozen_at" timestamp;
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "budget_frozen_by_manager_id" text;

DO $$ BEGIN
  ALTER TABLE "sites"
    ADD CONSTRAINT "sites_supermarket_id_fk"
    FOREIGN KEY ("supermarket_id") REFERENCES "supermarkets"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sites"
    ADD CONSTRAINT "sites_budget_frozen_by_fk"
    FOREIGN KEY ("budget_frozen_by_manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "site_budget_amendments" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "site_id" text NOT NULL,
  "reference" text NOT NULL,
  "status" "site_budget_amendment_status" DEFAULT 'draft' NOT NULL,
  "signed_amount_fcfa" numeric(14, 0) NOT NULL,
  "reason" text NOT NULL,
  "created_by_manager_id" text NOT NULL,
  "decided_by_manager_id" text,
  "decided_at" timestamp,
  "comment" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "site_budget_amendments"
    ADD CONSTRAINT "site_budget_amendments_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "site_budget_amendments"
    ADD CONSTRAINT "site_budget_amendments_site_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "site_budget_amendments"
    ADD CONSTRAINT "site_budget_amendments_created_by_fk"
    FOREIGN KEY ("created_by_manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "site_budget_amendments"
    ADD CONSTRAINT "site_budget_amendments_decided_by_fk"
    FOREIGN KEY ("decided_by_manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "site_budget_amendments_company_ref_uidx"
  ON "site_budget_amendments" ("company_id", "reference");
