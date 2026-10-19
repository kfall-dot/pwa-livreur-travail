-- T08 — **Rejeu de l'historique du CdG** (journal `DG CI ENERGIE`).
--
-- Le fichier du CdG est une **compilation**, pas une source (§5.3 de la spec
-- F02) : il recompile des données qui existent déjà ailleurs. Cette table ne
-- reçoit donc que ce que TraceO **ne connaît pas** — soit, au 16/10/2026,
-- **315 lignes hors BC / 58 988 050 F**. Les 192 lignes portant un n° de BC
-- (11 476 531 F) sont **exclues** : le CdG a confirmé en séance qu'elles
-- correspondent à des achats **déjà** saisis en BC dans TraceO (invariant I100).
--
-- Ces lignes sont des **faits datés**, pas des documents du circuit : créer de
-- vraies EB fabriquerait une chaîne d'approbations que personne n'a signée.
-- Elles alimentent le **réalisé** (F01/F02/F03) comme le ferait un déboursé.

CREATE TABLE IF NOT EXISTS "historical_expense_lines" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "companies"("id"),
  -- NULL = libellé de chantier du journal non reconnu : jamais deviné.
  "site_id" text REFERENCES "sites"("id"),
  "site_name" text,
  "occurred_on" date NOT NULL,
  "label" text NOT NULL,
  -- Code du référentiel F02 (`shared/chargeNatures.ts`) — jamais vide.
  "nature" text NOT NULL,
  "nature_label" text,
  "supplier_name" text,
  "amount_fcfa" numeric(14, 0) NOT NULL,
  "source" text NOT NULL DEFAULT 'journal_cdg',
  -- Empreinte stable de la ligne source (date + nature + libellé + montant + BC).
  "source_ref" text NOT NULL,
  -- Lot d'import : permet d'annuler un rejeu entier.
  "batch_id" text NOT NULL,
  "imported_by_manager_id" text REFERENCES "managers"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Idempotence (invariant I99) : rejouer le même fichier ne crée aucun doublon.
-- L'unicité porte sur l'empreinte de la ligne **source**, pas sur son contenu
-- métier — deux dépenses réellement identiques le même jour restent distinctes
-- si le journal les distingue.
CREATE UNIQUE INDEX IF NOT EXISTS "historical_expense_lines_source_uidx"
  ON "historical_expense_lines" ("company_id", "source", "source_ref");

-- Lecture du réalisé : par chantier, dans l'ordre chronologique.
CREATE INDEX IF NOT EXISTS "historical_expense_lines_site_idx"
  ON "historical_expense_lines" ("company_id", "site_id", "occurred_on");
