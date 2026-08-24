# Parité dashboard manager — pwa-livreur vs Livraison :5175

Référence : `Livraison/apps/dashboard-web` (port **5175** en dev).  
Implémentation embarquée : routes `/manager/*` dans ce dépôt (port **5199** avec `netlify dev`).

Dernière revue : juin 2026 (fraude reportée phase 2 — juin 2026).

---

## Résumé

Les **6 parcours manager** (Suivi, Planifier, Livreurs, Points, Produits, Tâches) existent des deux côtés avec des libellés alignés. Le manager pwa-livreur est un **superset partiel** : plus riche sur replan, quantités livrées et photos, mais **incomplet** sur déblocage OTP/reopen et certains garde-fous API.

La **surveillance fraude manager** (KPI, analytics, filtre score) est volontairement **hors scope du pilote CI** : peu de volume, équipe proche, litiges traités via photos + contact direct. Voir section « Phase 2 » ci-dessous.

Ce document liste les écarts **acceptés à ce stade** et ceux **à combler** pour une parité utile au terrain (sans exiger la parité fraude Livraison).

---

## Parité OK

| Zone | Détail |
|------|--------|
| Structure | 6 onglets identiques et libellés français alignés |
| Bannière tâches | Compteur + lien « Voir les tâches » sur le suivi |
| CRUD référentiels | Livreurs, points, catalogue produits (création, édition, toggle actif) |
| Tâches | Types `partial_delivery`, `delivery_confirmed`, `missed_delivery`, `delivery_cancelled`, `reassign_tour` |
| Déclaration produits | Table Produit / Unité / Accepté / Refusé / Justification |
| Planification | Sélection produit catalogue (`ProductLinesEditor`) |
| Édition tournée | Arrêts déjà livrés verrouillés côté serveur |
| Désactivation livreur | Tâches `reassign_tour` pour tournées futures |

---

## Écarts à combler (non parité)

Priorité pour convergence future avec `dashboard-web`.

### P0 — Métier critique (pilote)

| Écart | Référence 5175 | pwa-livreur |
|-------|----------------|-------------|
| Déblocage livraison | `POST .../resend-otp`, `POST .../reopen` + UI | Absent (UI + routes) |
| Colonne suivi Reçu | `receipt_id` dans le tableau | Absente (certificat accessible via détail) |

### P1 — Cohérence suivi / planification

| Écart | Référence 5175 | pwa-livreur |
|-------|----------------|-------------|
| Filtres statut | 9 valeurs (`delivered_partial`, `blocked`, `missed`, `disputed`…) | 6 options dans `managerConstants.ts` |
| Suspension livreur | 409 si livraison `in_progress` / `otp_sent` | Suspension sans garde-fou |
| Géocodage points | `GET /dashboard/geocode` + preview GPS | Lat/lng manuels, pas de preview |
| Conflits créneaux | `TOUR_SLOT_CONFLICT` | Non validé |
| Doublons arrêt/produit | `findDuplicateStop` | Non validé |
| `tour_editable` depuis détail | Bouton conditionnel | Bouton toujours visible (serveur bloque) |

### P2 — Convergence API / polish

| Écart | Référence 5175 | pwa-livreur |
|-------|----------------|-------------|
| Tâches API | `GET /dashboard/tasks` + `PATCH` | `GET /dashboard/manager-tasks` + `POST .../resolve` |
| Auth | JWT localStorage + refresh | Cookie HttpOnly 8 h |
| Nommage JSON | snake_case | camelCase |
| Édition tournée | Inline `PlanTour` + PUT | `EditTourModal` + PATCH |
| Unités catalogue | 6 unités | 9 (+ carton, sac, bidon) |
| Identifiants démo | `manager@ferme-dupont.fr` / `password123` | `manager@demo.fr` / `admin1234` |

---

## Écarts acceptés — phase 2 (hors pilote)

Reportés tant que le volume et l’équipe contrôle ne le justifient pas. **Ne pas traiter comme régression** ni bloquer le déploiement pilote.

| Écart | Référence 5175 | pwa-livreur |
|-------|----------------|-------------|
| KPI fraude | 5 KPI 30 j + filtre `minFraudScore` | 3 KPI opérationnels (total / validées / en attente) |
| Analytics fraude | `GET /dashboard/analytics` (scores moy./max., alertes) | Non implémenté |
| Colonne Fraude suivi | Score + niveau par livraison | Absente |
| Scoring livreur | Calcul photo GPS, OTP rapide, doublons… | Stub fixe `fraudScore: 12` — voir `VALIDATIONS-TESTS.md` §8 |

Réévaluer quand : livreurs sous-traités, > ~30 livraisons/jour, ou processus de contrôle a posteriori formalisé.

---

## Écarts acceptés (extensions pwa-livreur)

Intentionnels — ne pas traiter comme régressions tant que ce document n’est pas mis à jour.

| Extension | Description |
|-----------|-------------|
| Replanification avancée | Nouvelle tournée, `replan-template`, reliquat partiel, bouton depuis Suivi/Tâches |
| Groupement suivi par tournée | UX repliable par tournée + actions Replanifier / Modifier |
| Quantités livrées calculées | `src/lib/deliveredQuantity.ts` — attendu/livré par produit (I09) |
| Photos manager | Galerie + certificat cliquable (`GET .../photos`) |
| Champs dépôt | `depotName`, `depotAddress` sur tournée |
| Champs logistiques arrêt | Poids, photos requises, instructions |
| Stack monolithique | Express + Drizzle + Netlify Functions (pas de workers SMS/fraude Redis) |

---

## Matrice rapide par écran

### Suivi livraisons

- **5175** : tableau plat, KPI fraude, colonnes Palettes / Fraude / Reçu.
- **pwa** : groupé par tournée, KPI Livraisons/Validées/En attente, colonne Qté multi-produits — **sans** KPI/colonne fraude (choix pilote).

### Détail livraison

- **5175** : palettes attendues/livrées, déblocage OTP/reopen, pas de photos.
- **pwa** : quantités produits, photos, certificat, dépôt/fenêtre horaire — **sans** déblocage.

### Planifier

- **5175** : `PlanTour` inline, pas de dépôt, validations créneaux/doublons.
- **pwa** : formulaire + modale édition, dépôt obligatoire, flux replan dédié.

### Points

- **5175** : géocodage auto + preview.
- **pwa** : saisie manuelle lat/lng.

---

## Procédure de revue

1. Comparer `Livraison/apps/dashboard-web/src` avec `src/pages/ManagerDashboardPage.tsx` et modals.
2. Comparer routes Livraison `src/services/deliveries/routes.js` + `referentials/routes.js` avec `server/routes/dashboard.ts`.
3. Mettre à jour ce fichier quand un écart P0/P1 est corrigé (déplacer la ligne vers « Parité OK »).
4. Ajouter un invariant E2E dans `e2e/INVARIANTS.md` si le correctif doit être verrouillé en non-régression.

---

## Références

- Monorepo Livraison : `~/Downloads/mnt/agents/output/Livraison`
- Docs gestionnaire : `Livraison/docs/ETAPES.md` §8–9
- Invariants testés : `e2e/INVARIANTS.md`
- Gate locale : `npm run regression` (`scripts/regression.sh`)
