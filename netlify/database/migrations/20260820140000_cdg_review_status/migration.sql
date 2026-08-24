-- Circuit achats : après chiffrage SA, validation CdG avant DAF
ALTER TYPE "purchase_request_status" ADD VALUE IF NOT EXISTS 'cdg_review' AFTER 'submitted';
