ALTER TABLE treasury_orders ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'advance';
CREATE UNIQUE INDEX IF NOT EXISTS treasury_material_invoice_po_uidx
  ON treasury_orders(company_id, purchase_order_id) WHERE purpose = 'material_invoice';
