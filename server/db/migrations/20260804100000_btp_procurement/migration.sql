-- BTP procurement extension (Achats-Chantier)

DO $$ BEGIN
  CREATE TYPE "procurement_role" AS ENUM (
    'site_controller',
    'technical_director',
    'daf',
    'purchasing',
    'pdg'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "purchase_request_status" AS ENUM (
    'whatsapp_ingested',
    'draft_parsed',
    'draft_review',
    'submitted',
    'daf_review',
    'sa_review',
    'bt_pending',
    'daf_bt_review',
    'pdg_review',
    'po_ready',
    'delivery_scheduled',
    'delivered',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "whatsapp_message_type" AS ENUM ('text', 'audio', 'image', 'document', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "approval_decision" AS ENUM ('approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "purchase_doc_type" AS ENUM ('bc', 'bt');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "managers" ADD COLUMN IF NOT EXISTS "procurement_role" "procurement_role";

ALTER TABLE "tours" ADD COLUMN IF NOT EXISTS "purchase_order_id" text;

CREATE TABLE IF NOT EXISTS "sites" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "name" text NOT NULL,
  "address" text NOT NULL,
  "lat" numeric(10, 7),
  "lng" numeric(10, 7),
  "manager_id" text,
  "whatsapp_group_id" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "name" text NOT NULL,
  "contact_phone" text,
  "contact_email" text,
  "has_account" boolean DEFAULT false NOT NULL,
  "address" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "site_id" text NOT NULL,
  "reference" text NOT NULL,
  "status" "purchase_request_status" DEFAULT 'submitted' NOT NULL,
  "urgency" text,
  "requested_by_phone" text,
  "requested_by_name" text,
  "source_draft_id" text,
  "supplier_id" text,
  "total_amount_fcfa" numeric(14, 0),
  "notes" text,
  "created_by_manager_id" text,
  "submitted_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_request_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_request_id" text NOT NULL,
  "label" text NOT NULL,
  "unit" text NOT NULL,
  "quantity" numeric(12, 3) NOT NULL,
  "observation" text,
  "display_order" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "approval_steps" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_request_id" text NOT NULL,
  "role" "procurement_role" NOT NULL,
  "manager_id" text,
  "decision" "approval_decision" NOT NULL,
  "comment" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "document_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "doc_type" "purchase_doc_type" NOT NULL,
  "name" text NOT NULL,
  "fields" jsonb,
  "html_template" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "purchase_request_id" text NOT NULL,
  "supplier_id" text NOT NULL,
  "reference" text NOT NULL,
  "doc_type" "purchase_doc_type" DEFAULT 'bc' NOT NULL,
  "template_id" text,
  "amount_fcfa" numeric(14, 0) NOT NULL,
  "pdf_html" text,
  "tour_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "treasury_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "purchase_request_id" text NOT NULL,
  "reference" text NOT NULL,
  "amount_fcfa" numeric(14, 0) NOT NULL,
  "quotation_urls" jsonb,
  "pdf_html" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "external_id" text,
  "from_phone" text NOT NULL,
  "from_name" text,
  "message_type" "whatsapp_message_type" DEFAULT 'text' NOT NULL,
  "body_text" text,
  "media_blob_key" text,
  "group_id" text,
  "raw_payload" jsonb,
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "purchase_request_drafts" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL,
  "site_id" text,
  "status" "purchase_request_status" DEFAULT 'draft_parsed' NOT NULL,
  "source_message_ids" jsonb,
  "parsed_lines" jsonb,
  "parsed_urgency" text,
  "confidence_score" numeric(5, 2),
  "needs_review" boolean DEFAULT true NOT NULL,
  "purchase_request_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "eb_parse_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "draft_id" text NOT NULL,
  "prompt_version" text NOT NULL,
  "input_summary" text,
  "extracted_json" jsonb,
  "confidence_score" numeric(5, 2),
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "sites"
    ADD CONSTRAINT "sites_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sites"
    ADD CONSTRAINT "sites_manager_id_managers_id_fk"
    FOREIGN KEY ("manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "suppliers"
    ADD CONSTRAINT "suppliers_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_supplier_id_suppliers_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_requests"
    ADD CONSTRAINT "purchase_requests_created_by_manager_id_managers_id_fk"
    FOREIGN KEY ("created_by_manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_request_lines"
    ADD CONSTRAINT "purchase_request_lines_purchase_request_id_fk"
    FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "approval_steps"
    ADD CONSTRAINT "approval_steps_purchase_request_id_fk"
    FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "approval_steps"
    ADD CONSTRAINT "approval_steps_manager_id_managers_id_fk"
    FOREIGN KEY ("manager_id") REFERENCES "managers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "document_templates"
    ADD CONSTRAINT "document_templates_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_purchase_request_id_fk"
    FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_template_id_document_templates_id_fk"
    FOREIGN KEY ("template_id") REFERENCES "document_templates"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_tour_id_tours_id_fk"
    FOREIGN KEY ("tour_id") REFERENCES "tours"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "treasury_orders"
    ADD CONSTRAINT "treasury_orders_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "treasury_orders"
    ADD CONSTRAINT "treasury_orders_purchase_request_id_fk"
    FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_request_drafts"
    ADD CONSTRAINT "purchase_request_drafts_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_request_drafts"
    ADD CONSTRAINT "purchase_request_drafts_site_id_sites_id_fk"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "purchase_request_drafts"
    ADD CONSTRAINT "purchase_request_drafts_purchase_request_id_fk"
    FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "eb_parse_runs"
    ADD CONSTRAINT "eb_parse_runs_draft_id_purchase_request_drafts_id_fk"
    FOREIGN KEY ("draft_id") REFERENCES "purchase_request_drafts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "tours"
    ADD CONSTRAINT "tours_purchase_order_id_purchase_orders_id_fk"
    FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "supplier_name" text;
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "payment_mode" text;
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "ip" text;
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "etape" text;
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "pin_verified" boolean DEFAULT false NOT NULL;
