-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC ET CORRECTION DU RÔLE CdC
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Vérifier la structure de la table managers
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'managers'
ORDER BY ordinal_position;

-- 2. Vérifier les rôles actuels de tous les managers
SELECT id, email, name, procurement_role, role
FROM managers
ORDER BY created_at;

-- 3. Corriger le rôle du CdC (site_manager)
UPDATE managers
SET procurement_role = 'site_manager'
WHERE email = 'cdc@btp-pilote.ci';

-- 4. Vérification après correction
SELECT id, email, name, procurement_role, role
FROM managers
WHERE email = 'cdc@btp-pilote.ci';
