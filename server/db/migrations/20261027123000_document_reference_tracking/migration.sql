-- Synchronisation et suivi des imports ; migration additive, aucune renumérotation.
LOCK TABLE purchase_requests, purchase_orders, treasury_orders IN SHARE ROW EXCLUSIVE MODE;

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


-- Maintient le maximum lors d'un import ou d'une écriture d'une ancienne instance.
CREATE OR REPLACE FUNCTION track_document_reference_counter() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parts text[];
BEGIN
  IF TG_TABLE_NAME = 'treasury_orders' AND to_jsonb(NEW)->>'purpose' = 'material_invoice' THEN RETURN NEW; END IF;
  parts := regexp_match(NEW.reference, '^(EB|BC|BT)-([0-9]{4})-([0-9]+)$');
  IF parts IS NULL THEN RETURN NEW; END IF;
  INSERT INTO document_reference_counters (company_id, prefix, year, last_value)
  VALUES (NEW.company_id, parts[1], parts[2]::integer, parts[3]::bigint)
  ON CONFLICT (company_id, prefix, year) DO UPDATE
  SET last_value = GREATEST(document_reference_counters.last_value, EXCLUDED.last_value);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS purchase_requests_reference_counter ON purchase_requests;
CREATE TRIGGER purchase_requests_reference_counter AFTER INSERT OR UPDATE OF reference ON purchase_requests FOR EACH ROW EXECUTE FUNCTION track_document_reference_counter();
DROP TRIGGER IF EXISTS purchase_orders_reference_counter ON purchase_orders;
CREATE TRIGGER purchase_orders_reference_counter AFTER INSERT OR UPDATE OF reference ON purchase_orders FOR EACH ROW EXECUTE FUNCTION track_document_reference_counter();
DROP TRIGGER IF EXISTS treasury_orders_reference_counter ON treasury_orders;
CREATE TRIGGER treasury_orders_reference_counter AFTER INSERT OR UPDATE OF reference ON treasury_orders FOR EACH ROW EXECUTE FUNCTION track_document_reference_counter();
