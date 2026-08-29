DO $$ BEGIN
  CREATE TYPE "manager_role" AS ENUM ('admin', 'manager');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "managers" ADD COLUMN IF NOT EXISTS "role" "manager_role" NOT NULL DEFAULT 'manager';

UPDATE "managers" SET "role" = 'admin' WHERE "role" = 'manager';

CREATE TABLE IF NOT EXISTS "manager_invites" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "invited_by" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "manager_invites"
    ADD CONSTRAINT "manager_invites_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "manager_invites"
    ADD CONSTRAINT "manager_invites_invited_by_managers_id_fk"
    FOREIGN KEY ("invited_by") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "manager_password_resets" (
  "id" text PRIMARY KEY NOT NULL,
  "manager_id" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "manager_password_resets"
    ADD CONSTRAINT "manager_password_resets_manager_id_managers_id_fk"
    FOREIGN KEY ("manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
