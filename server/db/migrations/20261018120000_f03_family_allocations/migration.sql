-- F03 — budget vs réalisé : ventilation de l'enveloppe par **famille de charge**.
--
-- F01 fournit l'enveloppe (`sites.budget_initial_fcfa` + avenants approuvés),
-- F02 fournit le **réalisé par famille** (BC livrés + EB hors SA payées).
-- Cette table porte le maillon manquant : la répartition décidée par le CdG,
-- qui rend l'écart lisible poste par poste — le « tableau à double entrée »
-- demandé par le CDC (F03).
--
-- `family` reste du **texte** : le référentiel des 4 familles vit en code
-- (`shared/chargeNatures.ts`), décision F02-A — pas d'enum à maintenir ici.

CREATE TABLE IF NOT EXISTS "site_budget_family_allocations" (
  "id" text PRIMARY KEY,
  "company_id" text NOT NULL REFERENCES "companies"("id"),
  "site_id" text NOT NULL REFERENCES "sites"("id"),
  "family" text NOT NULL,
  "amount_fcfa" numeric(14, 0) NOT NULL DEFAULT 0,
  "updated_by_manager_id" text REFERENCES "managers"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Une seule allocation par (chantier, famille) : la ventilation est un état,
-- pas un historique — l'historique des enveloppes reste porté par F01 (avenants).
CREATE UNIQUE INDEX IF NOT EXISTS "site_budget_family_allocations_site_family_uq"
  ON "site_budget_family_allocations" ("site_id", "family");

CREATE INDEX IF NOT EXISTS "site_budget_family_allocations_company_idx"
  ON "site_budget_family_allocations" ("company_id");
