-- ═══════════════════════════════════════════════════════════════════════════════
-- I64 : le DT doit superviser le chantier pilote BTP
-- ─────────────────────────────────────────────────────────────────────────────
-- « Suivi chantier » côté DT (stock chantier /site-stock, budgets /site-budgets,
-- dépenses mensuelles) est volontairement filtré sur les chantiers qui lui sont
-- ASSIGNÉS via sites.supervisor_manager_id (même règle que les rapports
-- journaliers : chef → manager_id, DT superviseur → supervisor_manager_id).
--
-- Le seed ne renseignait que manager_id → le DT ne supervisait AUCUN chantier
-- → « Suivi chantier » vide (aucun stock affiché après livraison).
--
-- Correctif : assigner le DT comme superviseur du chantier pilote.
-- Idempotent : ne touche que les lignes sans superviseur.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Vérifier l'état actuel de la supervision du chantier pilote
SELECT id, name, manager_id, supervisor_manager_id
FROM sites
WHERE id = 'site-btp-pilote-1';

-- 2. Assigner le DT comme superviseur du chantier pilote (si non déjà fait)
UPDATE sites
SET supervisor_manager_id = 'mgr-btp-dt'
WHERE id = 'site-btp-pilote-1'
  AND supervisor_manager_id IS NULL;

-- 3. Vérification après correction
SELECT id, name, manager_id, supervisor_manager_id
FROM sites
WHERE id = 'site-btp-pilote-1'
  AND supervisor_manager_id = 'mgr-btp-dt';
