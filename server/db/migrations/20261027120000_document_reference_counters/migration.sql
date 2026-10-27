-- L'appelant exécute cette migration dans une transaction.
-- Empêche les écritures des anciens serveurs pendant le contrôle et l'initialisation.
LOCK TABLE purchase_requests, purchase_orders, treasury_orders IN SHARE ROW EXCLUSIVE MODE;

-- Aucun document historique n'est renuméroté. Un doublon doit être examiné avant déploiement.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM purchase_requests GROUP BY company_id, reference HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM purchase_orders GROUP BY company_id, reference HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM treasury_orders WHERE purpose <> 'material_invoice' GROUP BY company_id, reference HAVING count(*) > 1)
    OR EXISTS (
      SELECT 1 FROM (
        SELECT company_id, reference FROM purchase_orders WHERE reference ~ '^BT-[0-9]{4}-[0-9]+$'
        UNION ALL
        SELECT company_id, reference FROM treasury_orders WHERE purpose <> 'material_invoice' AND reference ~ '^BT-[0-9]{4}-[0-9]+$'
      ) AS bt GROUP BY company_id, reference HAVING count(*) > 1
    ) THEN
    RAISE EXCEPTION 'Numérotation : références historiques en doublon. Migration annulée ; audit et résolution explicite nécessaires, aucun document renuméroté.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS document_reference_counters (
  company_id text NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  prefix text NOT NULL CHECK (prefix IN ('EB', 'BC', 'BT')),
  year integer NOT NULL CHECK (year BETWEEN 1 AND 9999),
  last_value bigint NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (company_id, prefix, year)
);

-- Repartir du plus grand suffixe existant, par compagnie, type et année.
-- Les dossiers de règlement de factures ne sont pas des BT et ne sont pas numérotés ici.
WITH documents AS (
  SELECT company_id, reference FROM purchase_requests WHERE reference ~ '^EB-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT company_id, reference FROM purchase_orders WHERE reference ~ '^(BC|BT)-[0-9]{4}-[0-9]+$'
  UNION ALL
  SELECT company_id, reference FROM treasury_orders WHERE purpose <> 'material_invoice' AND reference ~ '^BT-[0-9]{4}-[0-9]+$'
), maxima AS (
  SELECT company_id, split_part(reference, '-', 1) AS prefix,
    split_part(reference, '-', 2)::integer AS year,
    max(split_part(reference, '-', 3)::bigint) AS last_value
  FROM documents GROUP BY company_id, split_part(reference, '-', 1), split_part(reference, '-', 2)::integer
)
INSERT INTO document_reference_counters (company_id, prefix, year, last_value)
SELECT company_id, prefix, year, last_value FROM maxima
ON CONFLICT (company_id, prefix, year) DO UPDATE
SET last_value = GREATEST(document_reference_counters.last_value, EXCLUDED.last_value);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_requests_company_reference_uidx ON purchase_requests(company_id, reference);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_company_reference_uidx ON purchase_orders(company_id, reference);
CREATE UNIQUE INDEX IF NOT EXISTS treasury_orders_company_reference_uidx ON treasury_orders(company_id, reference) WHERE purpose <> 'material_invoice';

