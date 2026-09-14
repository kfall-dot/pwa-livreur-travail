-- Transmission de la facture (copie) du SA vers le comptable
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_invoice_blob_key text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_invoice_file_name text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_invoice_content_type text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_invoice_uploaded_at timestamptz;
