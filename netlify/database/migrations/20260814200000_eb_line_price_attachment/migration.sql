-- Prix unitaire / montant ligne + pièce jointe SA (avant envoi DAF/PDG)
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "unit_price_fcfa" numeric(14, 0);
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "amount_fcfa" numeric(14, 0);
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "attachment_blob_key" text;
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "attachment_file_name" text;
ALTER TABLE "purchase_request_lines" ADD COLUMN IF NOT EXISTS "attachment_content_type" text;
