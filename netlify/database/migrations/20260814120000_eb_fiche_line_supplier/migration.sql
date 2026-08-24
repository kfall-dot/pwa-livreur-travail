-- Fournisseur / mode de paiement par ligne EB + traçabilité signature
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "supplier_name" text;
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "payment_mode" text;
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "ip" text;
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "etape" text;
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "pin_verified" boolean DEFAULT false NOT NULL;
