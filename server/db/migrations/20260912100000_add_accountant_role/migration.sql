-- Ajout du rôle « Comptabilité » (comptable) pour la nouvelle interface BC mensuelle / Factures / Rapports.
ALTER TYPE "procurement_role" ADD VALUE IF NOT EXISTS 'accountant';