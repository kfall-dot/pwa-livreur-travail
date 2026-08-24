-- Multi-tenant : entreprises + company_id sur les tables métier
DO $$ BEGIN
  CREATE TYPE "company_status" AS ENUM ('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "companies" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "status" "company_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_uidx" ON "companies" ("slug");

INSERT INTO "companies" ("id", "name", "slug", "status")
VALUES ('co-demo', 'Entreprise Démo', 'demo', 'active')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "managers" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "supermarkets" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "company_id" text;
ALTER TABLE "manager_tasks" ADD COLUMN IF NOT EXISTS "company_id" text;

UPDATE "managers" SET "company_id" = 'co-demo' WHERE "company_id" IS NULL;
UPDATE "drivers" SET "company_id" = 'co-demo' WHERE "company_id" IS NULL;
UPDATE "tours" SET "company_id" = 'co-demo' WHERE "company_id" IS NULL;
UPDATE "supermarkets" SET "company_id" = 'co-demo' WHERE "company_id" IS NULL;
UPDATE "products" SET "company_id" = 'co-demo' WHERE "company_id" IS NULL;
UPDATE "manager_tasks" SET "company_id" = 'co-demo' WHERE "company_id" IS NULL;

ALTER TABLE "managers" ALTER COLUMN "company_id" SET DEFAULT 'co-demo';
ALTER TABLE "drivers" ALTER COLUMN "company_id" SET DEFAULT 'co-demo';
ALTER TABLE "tours" ALTER COLUMN "company_id" SET DEFAULT 'co-demo';
ALTER TABLE "supermarkets" ALTER COLUMN "company_id" SET DEFAULT 'co-demo';
ALTER TABLE "products" ALTER COLUMN "company_id" SET DEFAULT 'co-demo';
ALTER TABLE "manager_tasks" ALTER COLUMN "company_id" SET DEFAULT 'co-demo';

ALTER TABLE "managers" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "drivers" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "tours" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "supermarkets" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "company_id" SET NOT NULL;
ALTER TABLE "manager_tasks" ALTER COLUMN "company_id" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "managers" ADD CONSTRAINT "managers_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "tours" ADD CONSTRAINT "tours_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "supermarkets" ADD CONSTRAINT "supermarkets_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "manager_tasks" ADD CONSTRAINT "manager_tasks_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN null;
END $$;
