-- Champ « Payée » du suivi factures (comptabilité) : boolean sur purchase_orders.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sa_invoice_paid boolean NOT NULL DEFAULT false;
