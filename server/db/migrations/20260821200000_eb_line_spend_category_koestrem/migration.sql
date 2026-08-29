-- Postes matériaux Koestrem 5.1 (remplace les anciennes familles materiaux / main-d’œuvre)
ALTER TABLE "purchase_request_lines"
  ALTER COLUMN "spend_category" SET DEFAULT 'autres_materiaux';
