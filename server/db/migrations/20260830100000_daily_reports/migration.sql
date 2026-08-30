-- Dossier du jour (RJC) : rapport quotidien chantier, tâches, consommations, photos
ALTER TYPE "procurement_role" ADD VALUE IF NOT EXISTS 'site_manager';

ALTER TABLE "sites"
  ADD COLUMN IF NOT EXISTS "supervisor_manager_id" text REFERENCES "managers"("id");

DO $$ BEGIN
  CREATE TYPE "site_report_status" AS ENUM ('draft', 'submitted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "site_daily_reports" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "companies"("id"),
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "report_date" date NOT NULL,
  "author_manager_id" text REFERENCES "managers"("id"),
  "status" "site_report_status" NOT NULL DEFAULT 'draft',
  "global_progress_pct" numeric(5, 2),
  "comment" text,
  "submitted_at" timestamp,
  "submissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_daily_reports_site_date_uidx"
  ON "site_daily_reports" ("site_id", "report_date");
CREATE INDEX IF NOT EXISTS "site_daily_reports_company_idx" ON "site_daily_reports" ("company_id");
CREATE INDEX IF NOT EXISTS "site_daily_reports_site_idx" ON "site_daily_reports" ("site_id");

CREATE TABLE IF NOT EXISTS "site_daily_tasks" (
  "id" text PRIMARY KEY,
  "report_id" text NOT NULL REFERENCES "site_daily_reports"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "done_note" text,
  "task_type" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "site_daily_tasks_report_idx" ON "site_daily_tasks" ("report_id");

CREATE TABLE IF NOT EXISTS "site_material_usages" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "companies"("id"),
  "site_id" text NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
  "report_id" text REFERENCES "site_daily_reports"("id") ON DELETE CASCADE,
  "task_id" text NOT NULL REFERENCES "site_daily_tasks"("id") ON DELETE CASCADE,
  "usage_date" date NOT NULL,
  "product_label" text NOT NULL,
  "unit" text NOT NULL,
  "quantity" numeric(12, 3) NOT NULL,
  "source_site_id" text REFERENCES "sites"("id"),
  "author_manager_id" text REFERENCES "managers"("id"),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "site_material_usages_site_idx" ON "site_material_usages" ("site_id");
CREATE INDEX IF NOT EXISTS "site_material_usages_product_idx" ON "site_material_usages" ("site_id", "product_label", "unit");

CREATE TABLE IF NOT EXISTS "site_report_photos" (
  "id" text PRIMARY KEY,
  "report_id" text NOT NULL REFERENCES "site_daily_reports"("id") ON DELETE CASCADE,
  "task_id" text REFERENCES "site_daily_tasks"("id") ON DELETE SET NULL,
  "photo_id" text NOT NULL,
  "size" integer,
  "taken_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "site_report_photos_report_idx" ON "site_report_photos" ("report_id");