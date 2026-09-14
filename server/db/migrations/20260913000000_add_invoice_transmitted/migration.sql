-- Flag Transmission de la facture du SA vers le comptable
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_invoice_transmitted boolean NOT NULL DEFAULT false;
-- Les factures déjà envoyées (avec PJ horodatée) sont considérées transmises
UPDATE purchase_orders SET sa_invoice_transmitted = true WHERE sa_invoice_uploaded_at IS NOT NULL;
