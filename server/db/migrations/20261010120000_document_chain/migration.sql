-- Chaîne documentaire EB ↔ BC ↔ BT ↔ BL (Lot 1)
--  - delivery_points.purchase_order_id : l'arrêt livré est rattaché à son BC ;
--    le BL n'est donc pas une nouvelle pièce : c'est le certificat RCT-XXXXXXXX
--    émis à la confirmation de livraison de cet arrêt.
--  - treasury_orders.purchase_order_id : le BT référence le BC qu'il finance.
--  - purchase_orders.bl_* : copie du bon de livraison fournisseur (miroir de sa_invoice_*).
ALTER TABLE delivery_points ADD COLUMN IF NOT EXISTS purchase_order_id text REFERENCES purchase_orders(id);
ALTER TABLE treasury_orders ADD COLUMN IF NOT EXISTS purchase_order_id text REFERENCES purchase_orders(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS bl_blob_key text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS bl_file_name text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS bl_content_type text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS bl_uploaded_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_delivery_points_purchase_order ON delivery_points(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_treasury_orders_purchase_order ON treasury_orders(purchase_order_id);

-- Backfill arrêt → BC : uniquement quand la tournée ne porte qu'un seul BC
-- (sinon l'affectation arrêt/BC est ambiguë et reste nulle).
UPDATE delivery_points dp
SET purchase_order_id = po.id
FROM purchase_orders po
WHERE po.tour_id = dp.tour_id
  AND dp.purchase_order_id IS NULL
  AND po.doc_type = 'bc'
  AND (SELECT count(*) FROM purchase_orders po2 WHERE po2.tour_id = dp.tour_id AND po2.doc_type = 'bc') = 1;

-- Backfill BT → BC : uniquement quand la demande ne porte qu'un seul BC.
UPDATE treasury_orders t
SET purchase_order_id = po.id
FROM purchase_orders po
WHERE po.purchase_request_id = t.purchase_request_id
  AND t.purchase_order_id IS NULL
  AND po.doc_type = 'bc'
  AND (SELECT count(*) FROM purchase_orders po2 WHERE po2.purchase_request_id = t.purchase_request_id AND po2.doc_type = 'bc') = 1;
