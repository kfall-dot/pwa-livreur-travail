# Spécification F01 — Fiche chantier : budget initial et avenants

**Version :** 0.5 — 20 août 2026  
**Statut :** décisions D-F01-1/2/3/5 **validées** — D-F01-4 provisoire — **F01.1 développé (hors prod)**  
**Source CDC :** Fadym Groupe, *Cahier des charges ERP — suivi budgétaire des chantiers*, F01 (critique)  
**Périmètre :** tenant pilote `co-btp-pilote`  
**Prérequis :** circuit achats EB → BC opérationnel sur le chantier témoin  

**Documents liés :** [Circuit achats](./BTP-REGLES-CIRCUIT-ACHATS.md) · [Décisions DT](./BTP-DECISIONS-DT-VALIDEES.md) · [Stock](./BTP-REGLES-STOCK-CHANTIER.md) · [Synthèse direction](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) · [Index BTP](./BTP-INDEX.md)

F08 (comptabilité générale) et F10 (marchés ST / RG) sont **hors TraceO** — voir synthèse §4.

---

## 1. Objectif

Donner au Contrôle de gestion **une fiche affaire unique** par chantier, avec :

1. un **budget initial** figé (FCFA) ;
2. des **avenants** tracés (jamais d’écrasement du budget initial) ;
3. en lecture : **engagé**, **reste à engager**, historique *qui / quand / quoi*.

**Promesse :** *« On ouvre le chantier, on voit l’enveloppe, ce qui a été commandé, ce qui reste — sans rouvrir Excel. »*

Ce n’est **pas** un ERP SYSCOHADA. Les montants viennent des **BC TraceO** (achats matériaux). Main-d’œuvre, engins et frais généraux : hors F01 (voir F02).

---

## 2. Hors scope (F01)

| Exclu | Où ça va |
|-------|----------|
| Plan de comptes / natures de charge | F02 |
| Tableau budget vs réalisé à double entrée | F03 |
| % avancement financier | F04 |
| Avancement physique | F05 |
| Alertes de dérive | F06 |
| Import masse de l’historique Excel CdG | T08 (après F01 stable) |
| Unification `sites` ↔ catalogue `supermarkets` | Dette connue — pas un prérequis F01 |
| Blocage comptable / FNE | ERP, pas TraceO |
| Intégration comptabilité générale / SYSCOHADA | **F08 — hors TraceO** |
| Marchés sous-traitants, situations, retenues de garantie | **F10 — hors TraceO** |

---

## 3. Glossaire — ne pas confondre

| Terme | Ce que c’est | Ce que ce n’est pas |
|-------|----------------|---------------------|
| **Budget initial** | Enveloppe CdG de l’affaire, saisie une fois | Le déboursé sec |
| **Avenant** | Modification **approuvée** du budget affaire (+ ou −) | Une EB, un BC, un avenant marché client |
| **Budget total** | `initial + Σ avenants approuvés` | La somme des EB |
| **Engagé** | Somme des **BC validés** du chantier (`doc_type = bc`, statut ≥ `po_ready`, non rejetés) | Les brouillons EB |
| **Reste à engager** | `budget_total − engagé` | Le stock chantier |
| **Déboursé sec** | Première EB de **lancement**, ventilée en lignes produits (D1) | Le budget de l’affaire |

Le déboursé sec **consomme** une partie du budget (via le BC qui en découle). Il ne **définit** pas le budget.

```
Budget affaire (F01)          Circuit achats (existant)
─────────────────────         ─────────────────────────
initial 100 000 000      →    DT : EB déboursé sec 8 000 000
avenant +15 000 000           SA : BC 7 850 000  →  engagé
total   115 000 000           reste à engager = 115 000 000 − Σ BC
```

---

## 4. Principes

| # | Principe |
|---|----------|
| P1 | **Une affaire = un `sites`**. Le budget vit sur `sites`, comme les EB/BC. Le point catalogue (`supermarkets`) reste l’adresse de livraison. |
| P2 | **Le budget initial est immuable** après gel. Tout changement = avenant. |
| P3 | **Les KPI engagé / reste sont calculés**, jamais saisis. |
| P4 | **Le CdG gèle l’enveloppe initiale.** Le **DT propose** l’avenant ; le **DAF l’approuve**. Ce n’est pas le même rôle. |
| P5 | Devise **XOF entière** (FCFA, 0 décimale) — même convention que les BC. |
| P6 | Dépassement d’enveloppe = **warning**, jamais un blocage de BC ni une commande silencieuse (D-F01-3). |

---

## 5. Décisions (19 août 2026)

| ID | Décision | Statut |
|----|----------|--------|
| **D-F01-1** | Nouveau rôle **`controle_gestion`** (libellé UI : Contrôle de gestion). Ce n’est ni le DAF ni le DT. | ✓ Validé |
| **D-F01-2** | Le **DT propose** l’avenant (`draft`). Le **DAF approuve ou rejette** (NIP). Ni le CdG ni le PDG n’approuvent l’avenant. | ✓ Validé (avenant 19 août : DAF, pas CdG) |
| **D-F01-3** | Un BC qui ferait `engagé > budget_total` : **warning** visible SA + CdG + DT + DAF. Le SA **peut** quand même créer le BC. | ✓ Validé |
| **D-F01-4** | EB déboursé sec alors que l’enveloppe n’est pas gelée | **Provisoire : warning**, même logique que D-F01-3. À recetter sur le premier déboursé sec réel. Pas de blocage en F01.1. |
| **D-F01-5** | **Pas de PDG** sur le budget ni sur l’avenant. Le seuil 500 000 FCFA reste uniquement sur le **montant du BC**. | ✓ Validé |

Le gel du **budget initial** est une action **CdG** (D-F01-1). L’approbation d’**avenant** est une action **DAF** (D-F01-2).

---

## 6. Modèle de données

### 6.1 Colonnes sur `sites`

| Colonne | Type | Règle |
|---------|------|--------|
| `budget_initial_fcfa` | `numeric(14,0)` nullable | Null = pas encore renseigné. Une fois gelé : **UPDATE interdit** (sauf admin seed). |
| `budget_frozen_at` | `timestamptz` nullable | Renseigné au gel. |
| `budget_frozen_by_manager_id` | `text` FK `managers` | Auteur du gel. |
| `supermarket_id` | `text` FK `supermarkets` nullable | Lien livraison — **optionnel** F01, recommandé au seed pilote. |

Pas de colonne `budget_total` persistée : toujours calculée.

### 6.2 Table `site_budget_amendments`

| Colonne | Type | Règle |
|---------|------|--------|
| `id` | text PK | |
| `company_id` | text | Isolation tenant |
| `site_id` | text FK `sites` | |
| `reference` | text | `AV-YYYYMMDD-XXXX` unique par company |
| `status` | enum | `draft` \| `approved` \| `rejected` |
| `signed_amount_fcfa` | numeric(14,0) | **Signé** : positif = hausse, négatif = baisse. ≠ 0. |
| `reason` | text | Obligatoire dès `draft` (min. 10 caractères) |
| `created_by_manager_id` | text | DT uniquement (D-F01-2) |
| `decided_by_manager_id` | text nullable | DAF si approved/rejected |
| `decided_at` | timestamptz nullable | |
| `comment` | text nullable | Motif de rejet |
| `created_at` | timestamptz | |

**Interdit :** `UPDATE` du montant ou du chantier après `approved`. Correction = nouvel avenant inverse + motif.

### 6.3 Formules (serveur, une seule source)

```
budget_total     = coalesce(budget_initial_fcfa, 0)
                   + Σ signed_amount_fcfa WHERE status = 'approved'

engagé           = Σ purchase_orders.amount_fcfa
                   WHERE site du request
                     AND doc_type = 'bc'
                     AND request.status NOT IN ('rejected')
                     AND request.status IN (
                       'po_ready', 'delivery_scheduled', 'delivered'
                     )
                     -- plus tout statut métier équivalent « BC validé »

reste_à_engager  = budget_total − engagé
```

**BT exclus** du engagé (ce n’est pas une commande fournisseur ; le BC associé l’est déjà).

Si `budget_initial` est null : `budget_total = 0`, KPI affichés « — » (pas 0 FCFA, pour ne pas laisser croire qu’il n’y a pas d’enveloppe).

---

## 7. Cycle de vie

### 7.1 Création chantier

Inchangé : DT ou DAF crée le `sites` (identité, adresse, groupe WhatsApp).  
Le CdG ne crée pas le chantier. Budget **absent** à la création. Badge fiche : **Enveloppe non renseignée**.

### 7.2 Gel du budget initial

| Étape | Acteur | Contrôle |
|-------|--------|----------|
| Saisie montant > 0 | **CdG** | Entier ≥ 1 FCFA |
| Confirmation « Geler l’enveloppe » | **CdG** | NIP CdG (même mécanique que l’approbation BC) |
| Écriture | Système | `budget_initial_fcfa`, `budget_frozen_at`, `budget_frozen_by` |

Après gel : champ montant **lecture seule**. Bouton « Geler » disparaît. DT, DAF, SA, PDG : **403** sur le gel (le DAF n’est pas le CdG).

### 7.3 Avenant

```
DT crée brouillon
        → DAF Approuve (NIP) ou Rejette
                → budget_total recalculé
```

| Contrôle | Règle |
|----------|--------|
| A1 | Budget déjà gelé (sinon 400 : *« Gelez d’abord le budget initial »*) |
| A2 | `signed_amount_fcfa ≠ 0` |
| A3 | Si baisse : `budget_total + montant ≥ engagé` — **blocage** (on ne rend pas le budget inférieur à ce qui est déjà commandé) |
| A4 | `reason` obligatoire |
| A5 | Un seul `draft` ouvert par chantier (évite les doubles avenants oubliés) |

### 7.4 Lien déboursé sec (D-F01-4 — provisoire)

Décision non tranchée. **Défaut pilote = warning**, aligné D-F01-3 :

- soumission DT **possible** si l’enveloppe n’est pas gelée ;
- bandeau : *« Enveloppe non renseignée — le déboursé sec ne sera pas rapproché d’un budget. »*
- si `total_amount_fcfa` > `reste_à_engager` (enveloppe gelée) : **warning**, pas de blocage.

F01.1 ne code pas ce contrôle. F01.2 l’ajoute en warning. Un passage en blocage exigera un avenant à cette spec.

---

## 8. Droits

Rôle Postgres / API : `controle_gestion`. Libellé : **Contrôle de gestion**. Compte pilote à seed (ex. `cdg@btp-pilote.ci`) — distinct de `daf@btp-pilote.ci`.

| Action | DT | **CdG** | DAF | SA | PDG |
|--------|----|---------|-----|----|-----|
| Voir fiche + KPI + historique | ✓ | ✓ | ✓ | ✓ lecture | ✓ lecture |
| Geler budget initial | — | ✓ | — | — | — |
| Créer avenant `draft` | ✓ | — | — | — | — |
| Approuver / rejeter avenant | — | — | ✓ | — | — |
| Modifier `budget_initial` après gel | — | — | — | — | — |
| Créer BC (existant) | — | — | — | ✓ | — |

Le **CdG** pose l’enveloppe. Le **DAF** valide les **BC** et les **avenants**. Le **PDG** n’intervient que sur le BC > 500 k FCFA.

---

## 9. API

Toutes les routes : auth manager + isolation `company_id`. Montants JSON = **number entier** (pas string).

| Méthode | Route | Rôle | Effet |
|---------|-------|------|--------|
| `GET` | `/procurement/sites/:id/budget` | DT, CdG, DAF, SA, PDG | Fiche + KPI + avenants |
| `POST` | `/procurement/sites/:id/budget/freeze` | **CdG** | Body `{ amountFcfa }` + NIP |
| `POST` | `/procurement/sites/:id/budget/amendments` | **DT** | Body `{ signedAmountFcfa, reason }` → `draft` |
| `POST` | `/procurement/sites/:id/budget/amendments/:amdId/approve` | **DAF** | NIP |
| `POST` | `/procurement/sites/:id/budget/amendments/:amdId/reject` | **DAF** | Body `{ comment }` + NIP |

### 9.1 Contrat `GET …/budget`

```json
{
  "siteId": "site-btp-pilote-1",
  "siteName": "Résidence Cocody — Tour A",
  "budgetInitialFcfa": 100000000,
  "budgetFrozenAt": "2026-08-20T10:00:00.000Z",
  "budgetTotalFcfa": 115000000,
  "engagedFcfa": 7850000,
  "remainingFcfa": 107150000,
  "overBudget": false,
  "amendments": [
    {
      "id": "…",
      "reference": "AV-20260821-0001",
      "status": "approved",
      "signedAmountFcfa": 15000000,
      "reason": "Fondations — fer complémentaire marché client",
      "createdByName": "Kouamé DT",
      "decidedByName": "Aya DAF",
      "decidedAt": "2026-08-21T09:00:00.000Z"
    }
  ]
}
```

`overBudget: true` si l’enveloppe est gelée **et** `engagedFcfa > budgetTotalFcfa` (warning D-F01-3, BC toujours créable).

Erreurs utiles (pas de 500 métier) :

| HTTP | Cas |
|------|-----|
| 400 | montant ≤ 0, avenant 0, baisse sous l’engagé, budget déjà gelé |
| 403 | mauvais rôle |
| 404 | site hors tenant |
| 409 | second `draft` ouvert ; second gel |

---

## 10. Interface

**Où :** onglet **Suivi chantier** — bandeau **Enveloppe** au-dessus du stock.  
Actions selon le rôle (CdG gèle, DT propose, DAF approuve). SA / PDG : lecture. SA : warning `overBudget` **avant** « Créer le BC », bouton resté actif.

### 10.1 Bandeau

| Champ | Affichage |
|-------|-----------|
| Budget initial | FCFA, ou « Non renseigné » |
| Avenants | somme signée + lien historique |
| Budget total | gras |
| Engagé | lien vers les BC du site |
| Reste à engager | vert si ≥ 0, warning si `< 0` |

Pas de graphique en F01. Code couleur uniquement sur le reste.

### 10.2 Actions

- CdG, budget non gelé : champ montant + **Geler l’enveloppe** (NIP).  
- DT, budget gelé : **Proposer un avenant** (montant signé, motif).  
- DAF, `draft` ouvert : **Approuver** / **Rejeter** (NIP). Pas de bouton PDG ni CdG sur l’approbation.

### 10.3 Historique

Table : date, référence, montant signé, motif, auteur, décision.  
Les mouvements d’engagement (BC) **ne sont pas recopiés ici** — ils restent dans Achats / Suivi BC. Le bandeau affiche seulement le total engagé.

---

## 11. Invariants E2E (à ajouter à `e2e/INVARIANTS.md` au développement)

| ID | Invariant |
|----|-----------|
| I66 | **CdG** gèle un budget initial > 0 → `GET budget` retourne ce montant, `budgetFrozenAt` non null ; un second gel → **409** |
| I67 | DT, DAF, SA, PDG **ne peuvent pas** geler ni modifier `budget_initial` (403) |
| I68 | Avenant : DT crée le `draft`, **DAF** approuve → `budget_initial` inchangé ; `budgetTotal = initial + Σ avenants approved`. CdG **ne peut pas** créer le `draft` ni l’approuver (403). PDG **ne peut pas** approuver (403). |
| I69 | Avenant de baisse qui rendrait `budget_total < engagé` → **400** |
| I70 | `reste_à_engager = budget_total − Σ BC validés` du chantier ; un BT seul ne compte pas |
| I71 | Isolation tenant : CdG d’une autre entreprise → **404** sur le budget du pilote |
| I72 | SA crée un BC qui dépasse le reste → **warning** `overBudget` ; le BC est **quand même** créé (D-F01-3) |

Seed : budget **non gelé** par défaut sur `site-btp-pilote-1` (les tests achats actuels ne doivent pas casser). Les tests F01 gèlent eux-mêmes dans le spec.

---

## 12. Critères d’acceptation CdG

1. Ouvrir le chantier témoin → voir enveloppe, avenants, engagé, reste, **sans Excel**.  
2. Un avenant apparaît dans l’historique avec auteur **DT** et approbateur **DAF** (pas CdG, pas PDG).  
3. Après un BC validé, l’engagé et le reste bougent **sans nouvelle saisie**.  
4. Le budget initial affiché après avenant est **le même qu’au gel**.  
5. Le SA voit le reste à engager au moment d’émettre le BC.

---

## 13. Effort et enchaînement

| Lot | Contenu | Charge indicative |
|-----|---------|-------------------|
| **F01.1** | Enum `controle_gestion` + compte pilote CdG + colonnes `sites` + table avenants + API + bandeau + I66–I72 | 1 sprint |
| **F01.2** | Warning déboursé sec si enveloppe absente ou dépassée (D-F01-4 provisoire) | après F01.1, dès que `debourse_sec` existe |
| **F02** | Nature de charge sur lignes EB | après F01.1 |
| **F03 / F04** | Tableau d’écarts et % financier | consomment `budget_total` et `engagé` de F01 — **ne pas les commencer avant** |

---

## 14. Recette manuelle pilote (1 chantier)

1. **CdG** gèle **100 000 000 FCFA** sur Résidence Cocody — Tour A.  
2. Circuit achats actuel : un BC ciment validé (montant réel du pilote).  
3. Vérifier engagé = montant BC, reste = 100 000 000 − BC.  
4. DT propose avenant **+15 000 000**, motif fondations.  
5. **DAF** approuve au NIP → total 115 000 000, initial toujours 100 000 000.  
6. Tenter un avenant **−200 000 000** → refusé.  
7. SA émet un BC au-dessus du reste → warning, BC créé.  
8. Compte **CdG** : Geler l’enveloppe, **pas** Approuver avenant.  
9. Compte **DAF** : Approuver / Rejeter avenant, **pas** Geler.

---

*Spécification de référence F01 — toute modification de règle (gel, avenant, engagé) fait l’objet d’un avenant daté à ce document.*

**Avenant 0.3 (19 août 2026) :** l’approbation d’avenant passe du CdG au **DAF**. Le CdG conserve uniquement le gel de l’enveloppe initiale.
