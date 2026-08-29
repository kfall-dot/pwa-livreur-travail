CREATE TABLE IF NOT EXISTS "company_units" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_units_company_code_uidx"
  ON "company_units" ("company_id", "code");

DO $$ BEGIN
  ALTER TABLE "company_units"
    ADD CONSTRAINT "company_units_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "products" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "unit" TYPE text USING "unit"::text;
ALTER TABLE "products" ALTER COLUMN "unit" SET DEFAULT 'palette';

ALTER TABLE "delivery_points" ALTER COLUMN "unit_type" DROP DEFAULT;
ALTER TABLE "delivery_points" ALTER COLUMN "unit_type" TYPE text USING "unit_type"::text;
ALTER TABLE "delivery_points" ALTER COLUMN "unit_type" SET DEFAULT 'palette';

DROP TYPE IF EXISTS "product_unit";
DROP TYPE IF EXISTS "unit_type";

INSERT INTO "company_units" ("id", "company_id", "code", "label", "display_order", "active")
SELECT
  'unit-' || c.id || '-' || d.code,
  c.id,
  d.code,
  d.label,
  d.display_order,
  true
FROM "companies" c
CROSS JOIN (
  VALUES
    ('palette', 'Palette', 1),
    ('kg', 'Kg', 2),
    ('colis', 'Colis', 3),
    ('caisse', 'Caisse', 4),
    ('plateau', 'Plateau', 5),
    ('unite', 'Unité', 6),
    ('carton', 'Carton', 7),
    ('sac', 'Sac', 8),
    ('bidon', 'Bidon', 9)
) AS d(code, label, display_order)
ON CONFLICT ("company_id", "code") DO NOTHING;
