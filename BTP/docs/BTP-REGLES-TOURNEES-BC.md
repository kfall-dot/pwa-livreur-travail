# Règles métier — Génération automatique des tournées à partir du BC

**Version :** 1.3 (tournée après validation BC — août 2026)  
**Périmètre :** tenant pilote `co-btp-pilote` — module Achats chantier TraceO  
**Validateurs cibles :** DT, SA, DAF (lecture), exploitant chantier  
**Statut :** en attente de validation opérationnelle — **pas de mise en prod** tant que ce document n’est pas signé

---

## 1. Objectif

Lorsqu’un **bon de commande (BC)** est **validé par le DAF et/ou le PDG** après émission par le SA, TraceO doit **créer automatiquement une tournée livreur** (enlèvement fournisseur → réception chantier), sauf cas d’exception explicites.

**Promesse métier :** *« BC validé = mission livreur créée et tracée »*, sans ressaisie logistique par le SA dans le cas standard.

**Hors scope de ce document :** capture WhatsApp, circuit d’approbation EB/DAF/PDG, génération des fiches Excel SA (EB, BT, registre), **stock chantier** — voir [BTP-REGLES-STOCK-CHANTIER.md](./BTP-REGLES-STOCK-CHANTIER.md).

---

## 2. Déclencheur

| Événement | Action TraceO |
|-----------|---------------|
| DAF ou PDG **approuve le BC** (`po_ready` — BC validé financièrement) | Évaluation des règles §3 |
| Règles OK | Création tournée + statut demande `delivery_scheduled` + notification livreur |
| Règles KO | BC validé conservé ; demande en `po_ready` + entrée **file « À planifier »** (§4) |

**Pas de tournée** avant **validation financière du BC** (sauf replan manuelle manager hors flux achats). Le SA peut émettre le BC (`po_pending_finance`) sans déclencher la logistique.

---

## 3. Conditions de génération automatique

Toutes les conditions suivantes doivent être vraies :

| # | Condition | Source données |
|---|-----------|----------------|
| C1 | Chantier (`site`) renseigné et actif | `purchase_requests.site_id` |
| C2 | Fournisseur renseigné et actif | `purchase_requests.supplier_id` |
| C3 | Au moins **1 ligne** EB/BC avec libellé + quantité > 0 | `purchase_request_lines` |
| C4 | Mode de paiement = **CRÉDIT** (compte fournisseur) | `purchase_requests.payment_mode` |
| C5 | Fournisseur `has_account = true` | `suppliers.has_account` |
| C6 | Livreur assignable résolu (§5) | config chantier ou pool |
| C7 | Date de livraison résolue (§6) | EB / règle défaut |
| C8 | Demande non annulée / BC non annulé | statut workflow |

Si **une seule** condition échoue → **file d’exception** (§4), pas d’échec du BC.

---

## 4. File d’exception « À planifier »

Cas typiques :

- Mode **ESPÈCE** ou **CHÈQUE**
- Fournisseur **particulier** (`has_account = false`) — ex. « PARTICULIER CIMENT »
- Montant BC **N/A** ou 0 sans lignes valorisées
- Aucun livreur défaut pour le chantier
- Date souhaitée **non renseignée** et règle date ambiguë
- Chantier ou fournisseur incomplet

**Comportement UI (SA) :**

- Badge / liste **« Livraisons à planifier »** (BC `po_ready` sans `tour_id`)
- Écran : BC résumé + choix **livreur** + **date** + bouton **« Confirmer la tournée »** (1 clic)
- Délai cible SA : **< 4 h ouvrées** après BC (indicateur, pas blocage technique)

---

## 5. Règle livreur

### 5.1 Ordre de résolution (priorité décroissante)

1. **Livreur par défaut du chantier** — paramètre `sites.default_driver_id` (à ajouter)
2. **Livreur par défaut tenant BTP** — paramètre entreprise `btp.default_driver_id`
3. **Dernier livreur** ayant livré sur ce chantier (30 jours)
4. Sinon → **file d’exception** (§4)

### 5.2 Contraintes

- Livreur **actif**, même `company_id` que la demande
- Un livreur peut avoir **plusieurs tournées** le même jour (comportement TraceO existant)
- Le SA peut **changer le livreur** en file d’exception ou via replan manager après création

### 5.3 Décision à valider (cocher)

- [ ] **A** — Un livreur unique BTP pilote pour tous les chantiers (pilote simple)
- [ ] **B** — Un livreur par chantier (recommandé dès 2+ chantiers)
- [ ] **C** — Choix SA systématique (pas d’auto livreur — **déconseillé** sauf phase 0)

**Recommandation pilote :** **A** pour J0, passer à **B** avant extension multi-chantiers.

---

## 6. Règle date de livraison

### 6.1 Ordre de résolution

1. **Date souhaitée** sur l’EB (`purchase_requests.requested_delivery_date` ou urgence « demain » parsée)
2. Sinon **J+1 ouvré** à partir de la date d’émission du BC
3. Si urgence **haute** (`urgency = urgent`) → **J+0** si BC émis avant **14h** locale (Abidjan), sinon J+1

### 6.2 Contraintes

- Date ≥ aujourd’hui (pas de tournée dans le passé sauf replan manager)
- Le SA peut décaler via file d’exception ou replan

### 6.3 Décision à valider

- [ ] Fuseau **Africa/Abidjan**
- [ ] Seuil urgence J+0 : **14h** (modifiable)
- [ ] Défaut sans date : **J+1**

---

## 7. Contenu de la tournée générée

Aligné sur le moteur TraceO existant (`createTourWithStops`) :

| Élément tournée | Valeur |
|-----------------|--------|
| **Dépôt** (enlèvement) | Nom + adresse **fournisseur** |
| **Arrêt 1** (livraison) | Nom + adresse **chantier** |
| **orderRef** | Référence EB (`EB-YYYY-NNNN`) |
| **Produits** | Lignes EB (désignation, qté, unité) |
| **Instructions** | `Livraison matériaux — {reference EB}` |
| **requiredPhotos** | **1** minimum (paramètre tenant) |
| **purchase_order_id** | Lien BC ↔ tournée (traçabilité) — voir §18 si plusieurs BC |

**Regroupement multi-chantiers :** voir **§18** (phase pilote J0 = 1 BC → 1 tournée ; consolidation dès volume suffisant).

---

## 8. Lien avec les documents SA (Excel)

| Document SA | Moment | Lien tournée auto |
|-------------|--------|-------------------|
| **Fiche de besoin achat** | Après validation DT | Source des lignes ; pas de lien direct tournée |
| **Fiche trésorerie achats** | Si **pas de compte** chez le fournisseur | Tournée auto **suspendue** — SA achète en présentiel (§9) |
| **Points fournisseurs BC** | À l’émission BC | Une ligne ; colonne **BON** = n° BC ; compléter **FACTURE / JUSTIFS** après livraison |

La tournée auto **n’remplace pas** le registre SA ; elle alimente la traçabilité (livreur, photos, OTP éventuel).

---

## 9. Modes de paiement et routage

| Mode (`payment_mode`) | BC | Tournée auto | BT / trésorerie |
|----------------------|-----|--------------|-----------------|
| **CREDIT** (`has_account = true`) | Oui | **Oui** (si C1–C8) | Non |
| **Sans compte** (`has_account = false`) | Oui | **Non** → file §4 ; SA achat présentiel **après** validation BC+BT+pro forma | **Oui** (BT + pro forma) |
| **ANNULE** | — | Annuler / ne pas créer | — |

**Seuil PDG (> 500 000 FCFA) :** calculé sur le **montant final du BC**. Indépendant de la tournée. Tournée auto uniquement **après** validation finance (`po_ready`).

---

## 10. Annulation et modifications

| Événement | Règle |
|-----------|--------|
| **Rejet EB / demande** avant BC | Aucune tournée |
| **BC annulé** après création | Si tournée **non démarrée** (aucun arrêt `in_progress` / `delivered`) → **supprimer** tournée ou marquer arrêts `failed` ; notifier livreur |
| **BC annulé** et tournée **déjà en cours** | Pas de suppression auto ; tâche manager **« Clôturer / replan »** |
| **Modification quantités** après BC | Replan manager ou nouvelle demande EB (pas de modification silencieuse) |

---

## 11. Notifications

| Destinataire | Quand | Canal |
|--------------|-------|-------|
| **Livreur** | Tournée créée (auto ou confirmée) | SMS (existant `POST /dashboard/tours`) |
| **SA** | File d’exception > 4 h | Email / badge manager (phase 2) |
| **Groupe WhatsApp** (option) | BC + tournée planifiée | Message statut (phase 2) |

---

## 12. Rôles et responsabilités

| Rôle | Responsabilité tournée |
|------|----------------------|
| **Technicien** | Aucune sur la tournée ; exprime le besoin WhatsApp |
| **DT** | Valide l’EB ; peut confirmer en file d’exception |
| **DAF / PDG** | Aucune création tournée ; approbations amont |
| **SA** | Émet le BC ; traite la file d’exception ; registre fournisseurs |
| **Manager livraison** | Replan / édition / suppression (outil Planifier-Suivi existant) |
| **Livreur** | Exécution PWA uniquement |

---

## 13. Paramètres tenant à configurer (pilote)

| Paramètre | Exemple pilote | Responsable |
|-----------|----------------|-------------|
| `btp.default_driver_id` | `drv-btp-1` | Admin TraceO |
| `sites.default_driver_id` | par chantier | DT |
| `btp.auto_tour_on_bc` | `true` | Admin |
| `btp.urgency_same_day_cutoff` | `14:00` | SA + DT |
| `btp.bt_threshold_fcfa` | `500000` | DAF / PDG |
| `btp.required_photos_delivery` | `1` | DT |
| `btp.consolidation_enabled` | `false` (J0) | Admin |
| `btp.consolidation_window_hours` | `4` | SA + DT |

---

## 14. Matrice de décision rapide

```
BC émis (po_ready)
    │
    ├─ payment_mode = CRÉDIT et has_account ?
    │       NON → File « À planifier »
    │       OUI ↓
    ├─ site + fournisseur + lignes OK ?
    │       NON → File « À planifier »
    │       OUI ↓
    ├─ livreur + date résolus ?
    │       NON → File « À planifier »
    │       OUI ↓
    ├─ Consolidation possible ? (§18, si activée)
    │       OUI → Ajouter arrêt sur tournée existante
    │       NON ↓
    └─ Créer tournée → delivery_scheduled → SMS livreur
```

---

## 15. Critères de succès pilote (4 semaines)

| Indicateur | Cible |
|------------|-------|
| % BC CRÉDIT avec tournée auto sans action SA | **≥ 80 %** |
| Délai médian BC → tournée (cas auto) | **< 5 min** |
| BC en file d’exception traités | **100 % < 24 h** |
| Livraisons avec preuve photo | **≥ 90 %** |
| Resaisie logistique par SA (hors exceptions) | **0** |

---

## 16. Validation (signature)

| Rôle | Nom | Date | OK / Réserves |
|------|-----|------|----------------|
| DT | | | |
| SA | | | |
| DAF | | | |
| Exploitant / MOA | | | |

**Réserves / dérogations pilote :**

```
(à compléter)
```

---

## 17. Prochaine étape technique (après validation)

1. Implémenter `autoTourOnBc` dans `createPurchaseOrderForRequest`
2. Ajouter `payment_mode` + `requested_delivery_date` sur `purchase_requests`
3. Ajouter `sites.default_driver_id` + config tenant
4. UI file « À planifier » pour SA
5. Lier `purchase_orders.tour_id` et `tours.purchase_order_id`
6. Tests E2E : BC CRÉDIT → tournée auto ; BC ESPÈCE → file exception
7. Consolidation multi-BC (§18) : table `tour_purchase_orders`, règle d’ajout d’arrêt, UI dégrouper

---

## 18. Consolidation multi-BC — même fournisseur, plusieurs chantiers

### 18.1 Contexte métier

Le SA émet souvent **plusieurs BC distincts** le même jour chez le **même fournisseur** (ex. UBH 01) pour alimenter **plusieurs chantiers** (Belle Côte, Résidence 35ème, ONAD…). Le registre **Points fournisseurs** conserve **une ligne par BC** — c’est correct côté compta et facturation.

En revanche, le **camion** ne doit pas forcément faire **autant d’allers-retours** au fournisseur : un **seul enlèvement** peut desservir **plusieurs chantiers**.

### 18.2 Principe directeur

| Entité | Règle |
|--------|--------|
| **BC** | **Toujours 1 BC = 1 chantier** — ne pas fusionner les BC |
| **Registre SA** | **1 ligne par BC** — inchangé |
| **Tournée livreur** | **1 enlèvement fournisseur** peut servir **N chantiers** = **1 tournée, N arrêts** |
| **Lien données** | **N BC → 1 tournée** (relation N:1) |

La consolidation est **logistique**, pas comptable.

### 18.3 Phasage

| Phase | Comportement |
|-------|----------------|
| **Pilote J0** | 1 BC → 1 tournée (1 arrêt). Simple, acceptable si faible volume. |
| **Pilote J1+** | Règles §18.4 : regroupement auto sur tournée existante **non démarrée**. |

### 18.4 Conditions de regroupement (ajout d’arrêt sur tournée existante)

Lors de l’émission d’un **nouveau BC**, si une tournée candidate existe, **ne pas** créer une nouvelle tournée — **ajouter un arrêt** (chantier du BC) sur la tournée existante.

Toutes les conditions suivantes doivent être vraies :

| # | Condition |
|---|-----------|
| R1 | Même `supplier_id` (même fournisseur / même dépôt enlèvement) |
| R2 | Même **date** de livraison (§6) |
| R3 | Même `driver_id` résolu (§5) |
| R4 | Tournée candidate : **aucun arrêt** en `in_progress` ou `delivered` |
| R5 | BC émis dans les **4 h** suivant le **premier BC** rattaché à cette tournée (fenêtre configurable : `btp.consolidation_window_hours`) |
| R6 | Règles §3 (CRÉDIT, `has_account`, etc.) OK pour le nouveau BC |

**Le produit n’a pas besoin d’être identique** entre BC (ciment + fer même passage fournisseur autorisé).

Si **aucune** tournée candidate → créer une nouvelle tournée (§2–§7).

### 18.5 Structure tournée consolidée

```
Dépôt : Fournisseur X (enlèvement — une seule fois)
  → Arrêt 1 : Chantier A — BC N° 1364 — lignes du BC A — orderRef EB-A
  → Arrêt 2 : Chantier B — BC N° 1370 — lignes du BC B — orderRef EB-B
  → Arrêt 3 : Chantier C — BC N° 1373 — lignes du BC C — orderRef EB-C
```

- **Séquence** des arrêts : ordre de création des BC, ou optimisable plus tard (OSRM — hors pilote).
- **PWA livreur** : une livraison par arrêt (photos, déclaration, OTP selon règle chantier).
- **Preuve** : par arrêt / par BC, pas une preuve globale floue.

### 18.6 Modèle de données cible

```
purchase_orders (BC) ──┐
purchase_orders        ├──► tour_purchase_orders (N:1) ◄── tours
purchase_orders        ──┘
                              │
                              └── delivery_points (1 par chantier / BC)
                                  └── purchase_order_id, orderRef
```

- `tours.depot` = adresse fournisseur (partagée).
- Chaque `delivery_point` référence **un** `purchase_order_id`.
- Colonne registre Excel optionnelle : **N° tournée TraceO** (lien logistique, pas remplacement du n° BC).

### 18.7 Décision SA et dégroupement

| Mode | Comportement |
|------|----------------|
| **Auto** (défaut) | Regroupement silencieux si R1–R6 OK |
| **Notification** (phase 2) | *« 3 BC UBH aujourd’hui — regrouper ? »* → Oui / Non |
| **Dégrouper** | SA ou manager : extraire **un BC** vers une **tournée dédiée** (urgence, créneau différent) |
| **Forcer séparé** | Case à cocher à l’émission BC : *« Tournée dédiée (ne pas regrouper) »* |

### 18.8 Cas limites

| Situation | Règle |
|-----------|--------|
| **Même chantier, 2 BC même jour** (ciment matin, fer après-midi) | **Pas de regroupement** par défaut si dates/créneaux différents ; sinon 2 arrêts même adresse possibles si même tournée — **déconseillé** ; préférer 2 tournées ou replan |
| **BC annulé** dans tournée consolidée | Retirer **l’arrêt** lié ; si dernier arrêt → supprimer tournée ou clôturer |
| **Un arrêt déjà démarré** | Nouveau BC → **nouvelle tournée** (R4 échoue) |
| **Fournisseurs différents** | Jamais de regroupement (dépôts différents) |
| **ESPÈCE / particulier** | File §4 — pas de consolidation auto |

### 18.9 Registre « Points fournisseurs »

- **Aucun changement** : toujours **1 ligne = 1 BC** (chantier, fournisseur, n° bon, montant, mode paiement).
- Colonne optionnelle future : **Tournée** (`tour-xxx`) pour corrélation logistique.
- Le recap mensuel par fournisseur reste basé sur les **BC**, pas sur les tournées.

### 18.10 Matrice de décision consolidation

```
Nouveau BC émis (po_ready, règles §3 OK)
    │
    ├─ Tournée candidate existe ? (R1–R6)
    │       NON → Nouvelle tournée (1 arrêt)
    │       OUI ↓
    ├─ BC « tournée dédiée » coché ?
    │       OUI → Nouvelle tournée
    │       NON ↓
    └─ Ajouter arrêt chantier sur tournée existante
        → Lier BC via tour_purchase_orders
        → Notifier livreur (mise à jour tournée)
```

### 18.11 Paramètres additionnels

| Paramètre | Défaut proposé | Responsable |
|-----------|----------------|-------------|
| `btp.consolidation_enabled` | `false` (J0) → `true` (J1+) | Admin |
| `btp.consolidation_window_hours` | `4` | SA + DT |
| `btp.allow_force_dedicated_tour` | `true` | SA |

### 18.12 Décision à valider (cocher)

- [ ] Pilote J0 : **1 BC = 1 tournée** uniquement (pas de consolidation)
- [ ] Pilote J1 : activer consolidation auto (R1–R6)
- [ ] Fenêtre regroupement : **4 h** (autre : _____ h)
- [ ] SA peut **dégrouper** / forcer tournée dédiée
- [ ] Colonne **N° tournée** dans export registre fournisseurs

**Recommandation :** J0 sans consolidation ; activer J1 dès **≥ 2 BC/jour même fournisseur** observés sur le terrain.

---

## 19. Notifications DT — quantités livrées (retex août 2026)

**Source :** entretien directeur technique — voir [BTP-REGLES-CIRCUIT-ACHATS.md §6](./BTP-REGLES-CIRCUIT-ACHATS.md).

### 19.1 Objectif

Le DT doit **voir par chantier** les quantités **livrées** (partielles ou totales) et être **alerté immédiatement** si une livraison est **partielle**.

### 19.2 Déclencheurs

| Statut livraison | Condition | Notification DT |
|------------------|-----------|-----------------|
| **`delivered`** | Pour chaque ligne : `qty_delivered ≥ qty_ordered` | Récap informatif (pas d’alerte critique) |
| **`partial`** | Au moins une ligne : `0 < qty_delivered < qty_ordered` | **Alerte prioritaire** |
| **`partial`** | Ligne entièrement non livrée (`qty_delivered = 0`) | **Alerte prioritaire** + mention ligne manquante |
| **`refused`** | Livraison refusée | Alerte + motif livreur |

**Moment :** à la **clôture de l’arrêt** par le livreur (déclaration quantités + photos), pas à la simple planification tournée.

### 19.3 Contenu notification

Pour chaque notification, inclure :

- Chantier (`site.name`)  
- Référence BC / EB  
- Fournisseur  
- Tableau **commandé / livré / écart** par ligne produit  
- Lien preuve (photos, certificat si OTP)  
- Horodatage  

**Exemple alerte partielle :**

> *Chantier Résidence Lilas — BC-2026-0042 — Livraison partielle : Ciment 50/50 ✓ · Fer 12 mm **15/20** (−5). [Voir preuve] [Créer EB complément]*

### 19.4 Canaux

> **Décision D3 (validée DT) :** **WhatsApp et dashboard** — les deux obligatoires en pilote.

| Canal | Usage |
|-------|-------|
| **Dashboard manager** (DT) | Badge + file « Livraisons à suivre » + dossier chantier |
| **WhatsApp** (DT) | Message sur **toute** livraison confirmée ; **alerte immédiate** si partielle |
| **Journal chantier** | Entrée `delivery_partial` ou `delivery_complete` |

### 19.5 Actions DT

| Action | Système |
|--------|---------|
| Acquitter | Marque alerte lue ; conserve historique |
| EB complément | Pré-remplit brouillon `standard` avec qtés manquantes |
| Escalade SA | Notifie SA avec lien BC |

### 19.6 Vue chantier — synthèse livraisons

Écran **Dossier chantier** (DT) : tableau cumulé par produit sur période glissante :

| Produit | Commandé (BC) | Livré | En attente | Dernière livraison |
|---------|-----------------|-------|------------|-------------------|

Alimenté par les arrêts `delivered` / `partial` liés aux BC du chantier.

### 19.7 Règles métier

| # | Règle |
|---|-------|
| N1 | Entrée stock (`IN`) = **qté livrée déclarée** uniquement (aligné stock §4) |
| N2 | Alerte partielle **même si** le livreur a validé « partiel accepté » |
| N3 | Pas de nouvelle alerte si **EB complément** déjà en cours pour la même ligne |
| N4 | DT notifié **même si** livraison consolidée multi-BC (1 notif par BC / chantier) |

### 19.8 Décisions validées

| Décision | Statut |
|----------|--------|
| Notifier DT sur **toute** livraison confirmée | ✓ DT |
| Alerte **prioritaire** si partielle | ✓ DT |
| Canaux : **WhatsApp + dashboard** | ✓ DT (D3) |
| Bouton **EB complément** depuis l’alerte | ✓ DT (à implémenter) |

Voir [BTP-DECISIONS-DT-VALIDEES.md](./BTP-DECISIONS-DT-VALIDEES.md).

---

*Références : `docs/originaux/` (fiches SA), `e2e/btp-procurement.spec.ts`, `server/services/procurementWorkflow.ts`.*
