-- F02 lot B — circuit « EB main-d'œuvre hors SA ».
--
-- 1. Rôle « Trésorerie » — décision CdG 16/10/2026 : « Oui créer un nouveau rôle Trésorerie ».
-- 2. Statuts du circuit hors SA. Le BT est émis APRÈS l'approbation DAF/PDG
--    (« On utilisera le BT généré automatiquement suite à l'approbation du DAF et/ou PDG »),
--    puis le déboursé et le paiement sont tracés.
-- 3. Statut du bon de trésorerie + table des déboursés (mode de paiement,
--    n° de transaction, facture EXIGÉE au déboursé — invariants I103 et I106).
--
-- Rappel PostgreSQL : `ALTER TYPE ... ADD VALUE` est autorisé dans une transaction
-- (PG 12+), mais la valeur ajoutée ne peut pas être UTILISÉE avant le commit —
-- ce fichier ne fait que les ajouter (précédent : 20260820140000_cdg_review_status).

-- 1. Rôle Trésorerie
ALTER TYPE "procurement_role" ADD VALUE IF NOT EXISTS 'treasury';

-- 2. Statuts du circuit hors SA, dans l'ordre du circuit
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'bt_ready' AFTER 'bt_pending';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'deboursed' AFTER 'bt_ready';
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'paid' AFTER 'deboursed';

-- 3. Statut du bon de trésorerie (aujourd'hui : aucun statut, cf. spec F02 §5.2 écart 2)
DO $$ BEGIN
  CREATE TYPE "treasury_order_status" AS ENUM ('pending', 'issued', 'deboursed', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "treasury_orders"
  ADD COLUMN IF NOT EXISTS "status" "treasury_order_status" NOT NULL DEFAULT 'pending';

-- 4. Mode de déboursé — « Reçu OM ou autre reçu » (décision CdG)
DO $$ BEGIN
  CREATE TYPE "disbursement_method" AS ENUM ('orange_money', 'cash', 'bank', 'cheque');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Déboursés — un par BT. La facture du paiement est rattachée à l'EB
--    (via le BT) et EXIGÉE au moment du déboursé (invariant I103).
CREATE TABLE IF NOT EXISTS "treasury_disbursements" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "companies"("id"),
  "treasury_order_id" text NOT NULL REFERENCES "treasury_orders"("id"),
  "amount_fcfa" numeric(14, 0) NOT NULL,
  "method" "disbursement_method" NOT NULL DEFAULT 'orange_money',
  "transaction_reference" text,
  "paid_at" timestamptz NOT NULL,
  "recorded_by_manager_id" text REFERENCES "managers"("id"),
  "invoice_blob_key" text,
  "invoice_file_name" text,
  "invoice_content_type" text,
  "invoice_printed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "treasury_disbursements_treasury_order_uq"
  ON "treasury_disbursements" ("treasury_order_id");

CREATE INDEX IF NOT EXISTS "treasury_disbursements_company_paid_idx"
  ON "treasury_disbursements" ("company_id", "paid_at");
