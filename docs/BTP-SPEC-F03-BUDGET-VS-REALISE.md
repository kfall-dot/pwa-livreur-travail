# Spécification F03 — Budget vs réalisé : ventilation par famille de charge

**Version :** 1.0 — 18 octobre 2026
**Statut :** ✅ **implémenté**
**Source CDC :** Fadym Groupe, *Cahier des charges ERP — suivi budgétaire des chantiers*, **F03 — Tableau budget vs réalisé à double entrée**
**Périmètre :** tenant pilote `co-btp-pilote`
**Prérequis :** **F01** (enveloppe : budget initial + avenants) · **F02** (réalisé par famille : BC livrés + EB hors SA payées)

**Documents liés :** [Spéc. F01](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md) · [Spéc. F02](./BTP-SPEC-F02-NATURES-CHARGE-DEPENSES-HORS-SA.md) · [Annexe entretien CdG](./BTP-ANNEXE-ENTRETIEN-CDG.md) · [Invariants E2E](../e2e/INVARIANTS.md) · [Index BTP](./BTP-INDEX.md)

---

## 1. Objectif

F01 répond à *« combien on a engagé sur l'enveloppe ? »*. F02 répond à *« sur quoi on a dépensé ? »*.
**F03 répond à la question qui manquait : « où l'argent a-t-il débordé ? »**

C'est le **tableau à double entrée** demandé par le CDC : l'enveloppe **ventilée par famille** face au **réalisé par famille**, avec l'écart et le taux de consommation.

**Promesse :** *« Le CdG voit d'un coup d'œil que les matériaux tiennent leur budget et que la main-d'œuvre a dépassé de 10 % — au lieu d'un écart global qui ne dit pas où chercher. »*

### 1.1 Le maillon manquant

| Acquis | Manquant |
|--------|----------|
| F01 : `budget_total` (enveloppe, avenants) | ❌ **la répartition de cette enveloppe par famille** |
| F02 : `realizedFcfa` par famille et par nature | — |
| F01 : `varianceFcfa` **globale** | ❌ l'écart **par famille** |

Sans la ventilation, l'écart global est un chiffre sans direction : il ne dit pas **quel poste** a consommé la marge.

---

## 2. Hors scope

| Exclu | Où ça va |
|-------|----------|
| Imputation par **ouvrage** du DQE (`N° DES PRIX`) | **F03.2** — voir §7 |
| Import du fichier Excel du CdG | **T08** |
| Écritures comptables / plan de comptes | **F08 — hors TraceO** |
| Blocage d'un BC sur dépassement de famille | **jamais** — D-F01-3 : le dépassement est un **warning** |

---

## 3. Modèle de données

**Table `site_budget_family_allocations`** — une ligne par (chantier, famille).

| Colonne | Type | Règle |
|---------|------|--------|
| `id` | text PK | |
| `company_id` | text FK `companies` | Isolation tenant |
| `site_id` | text FK `sites` | Une affaire = un `sites` (P1 de F01) |
| `family` | text | `materiaux` \| `main_oeuvre` \| `engins` \| `frais` |
| `amount_fcfa` | numeric(14,0) | Entier ≥ 0 |
| `updated_by_manager_id` | text FK `managers` | Auteur (CdG) |
| `updated_at` | timestamptz | |

**Index unique** `(site_id, family)` — la ventilation est un **état**, pas un historique (l'historique des enveloppes reste porté par les avenants F01).

> **`family` est du texte, pas un enum** : le référentiel des 4 familles vit en code (`shared/chargeNatures.ts`, décision F02-A). Une famille retirée du référentiel est **ignorée** à la lecture — jamais comptée dans un total.

---

## 4. Logique — `shared/budgetAllocation.ts`

Module **pur**, partagé serveur ↔ client (donc dans `shared/`, pas dans `server/`).

```ts
computeFamilyVariance({ allocations, realized, budgetTotalFcfa })
  → { rows, allocatedFcfa, realizedFcfa, varianceFcfa,
      unallocatedFcfa, allocationOverBudget, overrunFamilies }
```

| Règle | Détail |
|-------|--------|
| **Les 4 familles sont toujours présentes** | Une famille oubliée doit **se voir**, pas disparaître |
| **Écart** | `alloué − réalisé` (négatif = dépassement) |
| **Barème d'alerte** | identique à F01 : `ok` ≤ 2 % · `watch` ≤ 5 % · `alert` au-delà |
| **Famille allouée à 0 mais dépensée** | `alert` immédiate — le dépassement n'est pas calculable en % |
| **Enveloppe non ventilée** | `budget_total − Σ allocations` (positif = reste à ventiler) |
| **Ventilation hors enveloppe** | signalée, **jamais bloquée** (D-F01-3) |
| **Tri** | de la plus grave à la plus saine, puis par montant réalisé |

`normalizeAllocations()` durcit les entrées client : familles inconnues ignorées, montants négatifs ou non numériques rejetés, doublons fusionnés.

### 4.1 Décision d'architecture

`BUDGET_TOLERANCE_PCT`, `BUDGET_ALERT_PCT`, `roundPct` et `BudgetTrafficLight` ont été **déplacés de `server/services/siteBudget.ts` vers `shared/budgetTrafficLight.ts`** — `shared/` ne peut pas dépendre de `server/`. `siteBudget.ts` les **ré-exporte** : aucun import existant ne change.

---

## 5. API et écran

| Méthode | Route | Rôle | Effet |
|---------|-------|------|-------|
| `GET` | `/procurement/sites/:id/budget/allocations` | rôles achats | Ventilation du chantier |
| `PUT` | `/procurement/sites/:id/budget/allocations` | **`controle_gestion`** | Remplace la ventilation (écriture **complète**) puis renvoie l'écart recalculé |

L'écart est aussi exposé dans **`GET /procurement/sites/:id/indicators`** → champ **`familyVariance`**.

**Écran** — `CdgFamilyVarianceCard` dans le suivi chantier CdG :

| Colonne | Contenu |
|---------|---------|
| Famille | libellé + émoji |
| **Enveloppe** | allocation (éditable par le CdG) |
| **Réalisé** | BC livrés + EB hors SA payées |
| **Écart** | coloré selon le feu |
| **Consommé** | pastille 🟢 / 🟡 / 🔴 + % |

Repères de test : `mgr-cdg-family-variance`, `mgr-cdg-variance-row-{family}`, `mgr-cdg-variance-input-{family}`, `mgr-cdg-variance-edit`, `mgr-cdg-variance-save`, `mgr-cdg-variance-unallocated`.

**Couverture e2e** (`btp-procurement.spec.ts` — « F03 — budget vs réalisé par famille ») : gel de l'enveloppe (10 M) → ventilation CdG 8 M + 5 M → **4 familles présentes** (I109) · `allocatedFcfa` = 13 M · **`unallocatedFcfa` = −3 M** + `allocationOverBudget` (I107) → relecture persistée → **`familyVariance` exposé par les indicateurs** avec `realizedFcfa` identique au réalisé global (I108) → **403 pour un rôle non-CdG** → UI CdG : tableau + bouton de ventilation visibles · UI DAF : tableau visible, **pas** de bouton.

---

## 6. Décisions de conception

| # | Décision | Justification |
|---|----------|---------------|
| 1 | **Écriture complète, pas patch** | Une famille retirée de l'écran doit disparaître de la base, sinon les totaux mentent |
| 2 | **Allocation à 0 non stockée** | « Non ventilée » et « ventilée à 0 » sont le même état |
| 3 | **Écriture réservée au CdG** | Même acteur que le gel de l'enveloppe (D-F01-1) |
| 4 | **Pas de NIP sur la ventilation** | Acte de gestion réversible, contrairement au gel de l'enveloppe |
| 5 | **Aucun blocage** | Un dépassement de famille est un **warning** (D-F01-3) |
| 6 | **Écart recalculé côté serveur** | Une seule source du réalisé (I100 : BC livrés + EB hors SA payées) |
| 7 | **Aucune valeur inventée sans ventilation** | Sans allocations, l'écran invite à ventiler — il n'affiche pas un faux écart |

---

## 7. Le DQE — ce qu'il est, ce qu'on en fait

**Fichier :** `docs/originaux/DQE_AYALO.xlsx` — feuille `DQE ACT._AYALO`, **277 lignes**, en-tête ligne 11 (`N° DES PRIX`, `DESIGNATION DES OUVRAGES`, `U`, `QUANTITE`, `PRIX UNIT`, `MONTANT HT`), contexte **marché public** (maternité d'AYALO, ministère de la Santé).
**Synthèse :** `PREVISIONS DQE` **80 029 985** · `DEPENSES REEL` **33 650 337** · `ECART` **46 379 648**.

| Question | Réponse |
|----------|---------|
| **Le DQE est-il un référentiel à importer ?** | **Non en v1.** C'est un **devis d'ouvrage** : il fournit la **prévision globale**, pas une grille d'imputation |
| **À quoi sert-il alors ?** | C'est la **source de l'enveloppe** — `sites.budget_initial_fcfa` (F01). Le CdG y lit les « prévisions » |
| **Pourquoi pas l'imputation par ouvrage ?** | Le journal du CdG **n'a aucune colonne `N° DES PRIX`** : aucune dépense n'est imputable à un ouvrage aujourd'hui. Comparer par ouvrage exigerait d'abord d'enrichir la saisie |
| **Que fait la v1 ?** | Elle compare sur l'axe **qui existe dans les données** : la **famille de charge** |
| **Et l'écart global DQE ↔ réel ?** | Il est déjà couvert : `PREVISIONS` = l'enveloppe F01, `REEL` = le réalisé F02, `ECART` = `varianceFcfa` |

**F03.2 (différé) :** imputation par `N° DES PRIX` — **déclencheur** : le CdG confirme vouloir suivre les écarts **par ouvrage** (Q33) **et** accepte d'ajouter une colonne d'imputation à sa saisie.

---

## 8. Invariants

| ID | Invariant |
|----|-----------|
| **I107** | **Enveloppe ventilée jamais silencieuse** : `budget_total − Σ allocations` est **toujours affiché** quand il est non nul ; une ventilation hors enveloppe est signalée mais **jamais bloquée** |
| **I108** | **Écart par famille = réalisé F02 − allocation** : la même source de réalisé que F01/F02 (BC livrés + EB hors SA payées, I100) — aucun calcul divergent |
| **I109** | **Aucune famille masquée** : les 4 familles apparaissent même à 0 ; une famille allouée à 0 mais dépensée est en **alerte** |

---

## 9. Ce qui reste

| # | Sujet | Blocage |
|---|-------|---------|
| 1 | Imputation par ouvrage (`N° DES PRIX`) | **Q33** non tranchée + colonne absente du journal |
| 2 | Ventilation proposée automatiquement (ex. au prorata du réalisé N-1) | aucune demande |
| 3 | Révision de la ventilation dans le temps (historique) | les avenants F01 couvrent le besoin d'historique |

