# Spécification F02 — Natures de charge et dépenses chantier hors SA

**Version :** 0.2 — 16 octobre 2026
**Statut :** ✅ **F02 lot A et lot B livrés intégralement** (A · B.1 fondations · B.2 workflow + API · B.3 UI Trésorerie) — voir [annexe §6](./BTP-ANNEXE-ENTRETIEN-CDG.md#6-réponses-du-cdg--séance-du-16-octobre-2026)
**Source CDC :** Fadym Groupe, *Cahier des charges ERP — suivi budgétaire des chantiers*, **F02 — Imputation chantier × nature de charge**
**Périmètre :** tenant pilote `co-btp-pilote`
**Prérequis :** F01.1 (enveloppe budgétaire) développé hors prod · circuit EB → BC opérationnel

**Documents liés :** [Spéc. F01](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md) · [Annexe entretien CdG](./BTP-ANNEXE-ENTRETIEN-CDG.md) · [Circuit achats](./BTP-REGLES-CIRCUIT-ACHATS.md) · [Décisions DT](./BTP-DECISIONS-DT-VALIDEES.md) · [Invariants E2E](../e2e/INVARIANTS.md) · [Index BTP](./BTP-INDEX.md)

F08 (comptabilité générale) et F10 (marchés ST / RG) sont **hors TraceO** — voir synthèse §4.

---

## 1. Objectif

Le CDC demande **F02 : « imputation chantier × nature de charge »**. F01 a livré l'enveloppe ; il manque **l'axe nature**.

Cette spécification livre **deux lots** :

| Lot | Nom | Question à laquelle il répond | Risque |
|-----|-----|-------------------------------|--------|
| **A** | **Natures de charge** | *« Sur quoi l'argent a-t-il été dépensé ? »* (matériaux, main d'œuvre, engins, frais) | **faible** — table de référence + 1 colonne + 1 filtre |
| **B** | **Dépenses hors SA** | *« Comment une dépense de main-d'œuvre entre-t-elle dans TraceO ? »* | **élevé** — statuts, rôle trésorerie, paiement, facture |

**Promesse du lot A :** *« Le CdG filtre les dépenses par nature, et la part « matériaux » affichée est enfin vraie. »*
**Promesse du lot B :** *« Une EB de main-d'œuvre suit DT → CdG → DAF → trésorerie sans passer par le SA, et le paiement Orange Money est tracé avec sa facture. »*

### 1.1 Ce que F02 **n'est pas**

Ce n'est **pas** un plan comptable SYSCOHADA (F08, hors TraceO), et ce n'est **pas** le rapprochement budget / réalisé (F03).

---

## 2. Hors scope

| Exclu | Où ça va |
|-------|----------|
| Budget vs réalisé, écart, référentiel DQE | **F03** |
| **Rejeu** de l'historique du CdG — **lignes hors BC uniquement** | **T08** — le fichier est une **compilation**, pas une source (§5.3) |
| Plan de comptes / écritures SYSCOHADA | **F08 — hors TraceO** |
| Marchés sous-traitants, situations, retenues de garantie | **F10 — hors TraceO** |
| % avancement financier | F04 |
| Alertes de dérive | F06 |
| Fiche de paie, DIPE, cotisations sociales | **hors TraceO** (paie) |

---

## 3. Glossaire — ne pas confondre

| Terme | Ce que c'est | Ce que ce n'est pas |
|-------|----------------|---------------------|
| **Nature de charge** | Poste de dépense élémentaire (`SALAIRES`, `CIMENT`, `MAIN D'ŒUVRE CARRELEUR`…) — **35** dans le journal du CdG | Une famille |
| **Famille** | Regroupement de natures : **matériaux** / **main d'œuvre** / **engins** / **frais** | Le poste lui-même |
| **Alias** | Variante de libellé rattachée à une nature canonique (`MATERIELS DE NETOYAGE` → `MATERIELS NETTOYAGE`) | Une nature |
| **EB hors SA** | EB dont les lignes sont en famille **main d'œuvre / engins / frais** : elle **saute** le SA et génère un **BT** | Une EB sans validation |
| **BT** | Bon de trésorerie — autorisation de déboursé pour un fournisseur / bénéficiaire **sans compte** | Un BC |
| **Déboursé** | **Paiement effectif** (sortie de caisse / Orange Money) | L'engagé, ni le réalisé comptable |
| **Réalisé** | Dépense **constatée** (BC livré **ou** EB hors SA payée) | L'engagé |
| **Engagé** | Somme des **BC validés** (F01) — **exclut** les EB hors SA | Le réalisé |

---

## 4. Principes

| # | Principe |
|---|----------|
| **P1** | **Une nature = un code stable**, jamais un libellé libre. Le libellé peut changer, le code non. |
| **P2** | **La famille se déduit de la nature**, jamais l'inverse. Un poste a **une seule** famille. |
| **P3** | **La famille est la clé de routage** : `materiaux` → circuit SA/BC ; `main_oeuvre` / `engins` / `frais` → circuit **hors SA**. |
| **P4** | **Aucune EB hors SA sans pièce justificative** avant le déboursé (invariant **I103**). |
| **P5** | **Le réalisé n'est jamais doublé** : une ligne qui porte un n° de BC se **rattache** au BC, elle ne s'y ajoute pas (invariant **I100**). |
| **P6** | Devise **XOF entière** (FCFA, 0 décimale) — même convention que les BC. |
| **P7** | **Le seuil PDG 500 000 F** s'applique au **montant du dossier validé** — BC comme EB hors SA. |
| **P8** | **Aucune rupture du circuit matériaux** : F02-B est **additif**. Un BC matériaux suit exactement le circuit d'aujourd'hui. |
| **P9** | **Rien n'est supprimé** : une nature se **désactive** (`active = false`), elle ne se supprime pas — les lignes historiques restent lisibles. |

---

## 5. État des lieux (vérifié dans le code, 16/10/2026)

### 5.1 Ce qui existe déjà

| Élément | Fichier | État |
|---------|---------|------|
| Colonne nature sur ligne d'EB | `server/db/schema.ts:602` — `spend_category` text, défaut `autres_materiaux` | ✅ existe |
| Liste des natures | `shared/ebSpendCategory.ts` — **17 postes**, tous **matériaux** | ⚠️ **incomplet** |
| Pièce jointe sur ligne d'EB | `server/db/schema.ts:599-601` — `attachment_blob_key` / `_file_name` / `_content_type` | ✅ existe |
| BT trésorerie | `server/db/schema.ts:665-684` — table `treasury_orders` | ⚠️ **sans statut ni paiement** |
| Seuil PDG | `server/config/procurement.ts:11` — `DEFAULT_BT_THRESHOLD_FCFA = 500_000` | ✅ existe |
| Génération du BT | `server/services/procurementWorkflow.ts:113` — `needsBt = supplierHasAccount === false` | ✅ existe |
| Statut `cdg_review` | `server/db/schema.ts:46+` · `src/pages/manager/procurement/procurementTypes.ts:18` | ✅ existe |
| Modèle de pièce jointe à imiter | `server/db/schema.ts:649-658` — `purchase_orders.sa_invoice_*` et `bl_*` | ✅ existe |

### 5.2 Les 3 écarts à combler (mesurés dans le code)

**Écart 1 — les familles non-matériaux ont été *aplaties*.**

`shared/ebSpendCategory.ts:32-38` :

```ts
const LEGACY_SPEND_CATEGORY: Record<string, EbSpendCategory> = {
  materiaux: 'autres_materiaux',
  main_oeuvre: 'autres_materiaux',      // ← la famille a existé…
  services: 'autres_materiaux',          // ← …puis a été délibérément écrasée
  sous_traitance: 'autres_materiaux',
  autres: 'autres_materiaux',
}
```

Et `shared/ebSpendCategory.ts:69-71` :

```ts
export function isMaterialsSpendCategory(value?: string | null): boolean {
  return isEbSpendCategory(normalizeEbSpendCategory(value))   // ← retourne TRUE pour toute valeur
}
```

**Conséquence :** `materialsFcfa` (agrégé dans `server/services/siteIndicators.ts:239-244`) compte **tout** comme matériaux.

> **Le lot A est donc une *réparation*, pas une création.** Les familles `main_oeuvre`, `services` et `sous_traitance` ont existé puis ont été fondues dans `autres_materiaux` — parce que F01 ne traitait alors que les matériaux.

**Écart 2 — le BT existe, mais ne porte ni statut, ni paiement, ni facture.**

`treasury_orders` (`server/db/schema.ts:665-684`) = `id`, `company_id`, `purchase_request_id`, `purchase_order_id`, `purchase_request_line_id`, `reference`, `amount_fcfa`, `quotation_urls`, `pdf_html`, `created_at`.

**Rien** sur : le visa, la date de déboursé, le mode de paiement, le n° de transaction Orange Money, la facture.

**Écart 3 — le rôle « trésorerie » n'existe pas.**

`procurementRoleEnum` (`server/db/schema.ts:29-38`) = `site_controller`, `technical_director`, `daf`, `purchasing`, `pdg`, `controle_gestion`, `site_manager`, `accountant`.

**Aucun rôle trésorerie** → personne ne peut, aujourd'hui, constater un déboursé dans TraceO.

### 5.3 Nature du fichier du CdG — **clarification du 16/10/2026**

Le CdG a précisé : *« le fichier CI ENERGIE est créé par le CdG ; il a compilé des données déjà
existantes afin de faire un suivi des dépenses sur un chantier en particulier. »*

Ce n'est donc **pas une source** : c'est une **recompilation**, et son but est un **suivi par
chantier** — c'est-à-dire exactement ce que TraceO doit produire.

| Ce que le fichier **est** | Ce que le fichier **n'est pas** |
|---------------------------|--------------------------------|
| La **spécification de la sortie** (« golden file ») : 10 colonnes, 35 natures pré-classées, 2 blocs | Une source opérationnelle (BC, reçu Orange Money, facture) |
| Un **outil de pilotage manuel** qui contourne l'absence de F03 | Un journal comptable |
| **Mono-chantier** (un site à la fois) | Un bordereau multi-chantiers |

**Conséquences :**

1. **T08 n'est pas un import d'historique** mais un **rejeu du passé** : seules les **315 lignes
   sans BC (58 988 050 F)** sont concernées. Les **192 lignes rapprochées sont exclues** — **I100
   bloquant** (§7.6).
2. **F03 est la livraison qui compte** pour le CdG : elle **remplace le fichier manuel**. F02-B la
   nourrit en données réelles ; T08 ne fait qu'**amorcer** les 5 mois d'historique.
3. **Le référentiel F02-A est déjà la taxonomie du CdG** : les 35 natures pré-classées (§6.3) sont
   sa grille de lecture — TraceO la parle désormais.

### 5.4 Vérification sur le **fichier réel** — 17/10/2026

Le parseur a été exécuté sur `docs/originaux/DG CI ENERGIE (version 1).xlsx`
(`npm run journal:replay` — hors base, hors serveur, **aucune écriture**).

| Grandeur | Séance du 16/10 | **Fichier réel** | |
|---|---|---|---|
| Lignes exploitables | 508 | **508** | ✅ |
| Lignes portant un n° de BC | 192 | **192** | ✅ |
| Montant avec BC | 11 476 531 F | **11 476 531 F** | ✅ |
| Montant hors BC | 58 988 050 F | **58 988 050 F** | ✅ |
| Lignes hors BC | 315 | **316** | ⚠️ écart de 1 — le **montant** est exact |

**Ce que l'exécution a appris, et qu'aucune relecture n'aurait donné :**

1. **Les en-têtes réels diffèrent de l'annexe §3A.** La colonne C est `Catégorie` (et non « Nature
   de dépense »), la G est `Charges (Produits)` (et non « Designation »), la H est `Qté`. La
   première version du parseur rejetait **les 508 lignes** pour « Nature absente » : le bug n'était
   visible qu'en exécutant. Les deux formulations sont désormais acceptées.
2. **Le journal nomme un chantier — mais pas celui qu'on croyait.** `Nom Chantier` vaut
   `DG CI ENERGIE` (503 lignes) ou `CI ENERGIE DG` (5). Vérification **en base** le 17/10/2026 :
   `DG CI ENERGIE` **est** un chantier de TraceO — `site-xlsx-dg-ci-energie`, venu du catalogue
   Excel (44 chantiers pour `co-btp-pilote`, dont 43 `site-xlsx-*`). Le rapprochement de libellés
   le retrouve donc **sans rien désigner** : les **503 lignes s'imputent au siège du CdG**. Les
   5 lignes `CI ENERGIE DG` (ordre inversé) ne correspondent à rien et restent **non imputées**.
   ⚠️ **À clarifier avec le CdG** : ces 503 lignes sont-elles vraiment des dépenses du **siège**
   `DG CI ENERGIE`, ou le nom de la société a-t-il été recopié dans un fichier censé être
   **mono-chantier** (§5.3) ? C'est cette réponse qui décide de l'imputation.
   L'import accepte malgré tout un **chantier cible** (sélecteur CdG) pour les lignes non
   reconnues, et **refuse** (400) quand **aucune** ligne n'est imputable.
3. **Deux paires de lignes strictement identiques existent réellement** :
   `10/04/2026 · MAIN D'ŒUVRE CARRELEUR · « CARRELEURS » · 24 000 F` ×2 et
   `MANŒUVRE ET AIDES · « AIDES » · 36 000 F` ×2. Ce sont **quatre paiements distincts** — une
   empreinte sans ordinal en aurait perdu **60 000 F en silence**. Les références portent
   désormais un ordinal (`…-1`, `…-2`), ce qui préserve l'idempotence (I99).
4. **Le fichier porte 2 feuilles** : `Feuil1` = le journal détaillé (508 lignes) ; `Feuil2` = le
   **rapport agrégé** `RAPPORT DU 02/03/2026 AU 31/07/2026` (35 charges × montant) — le tableau
   montré en séance. C'est la **spécification de la sortie** (§5.3), pas une entrée.
5. **Période réelle** : `2026-03-02 → 2026-07-28` (5 mois), cohérente avec l'en-tête du rapport.
6. **Le référentiel F02-A couvre 100 % du journal** : **419 lignes sur 508** se rapprochent
   **exactement** par alias, les 89 autres passent par l'inférence, et **aucune** ne retombe dans
   le fourre-tout « autres matériaux ». Aucune nature à ajouter.

**Répartition du rejeu hors BC par famille** — ce que F03 affichera dès l'amorçage :

| Famille | Lignes | Montant | Part |
|---|---|---|---|
| `materiaux` | 42 | 45 504 150 F | 77,1 % |
| `main_oeuvre` | 229 | 12 884 510 F | 21,8 % |
| `engins` | 45 | 599 390 F | 1,0 % |
| `frais` | 0 | 0 F | 0 % |

Deux points à porter au CdG :

- **45 504 150 F de matériaux hors BC** (marbre/plinthes 26,1 M · matériels de cuisine 10,5 M ·
  menuiserie aluminium 7,5 M). Ce sont, par nature, des achats qui **devraient** passer par le
  circuit SA → BC (I102). L'historique révèle l'écart — c'est un constat de gouvernance, pas un
  défaut du rejeu.
- **Aucun frais** dans le journal. Ses frais de dépôt / TVA / sous-traitance sont-ils hors journal ?

---

## 6. Lot A — Natures de charge

### 6.1 Référentiel des familles

| Code | Libellé | Circuit | Exemples de natures |
|------|---------|---------|---------------------|
| `materiaux` | Matériaux | **SA → BC** | Ciment, Carocol, Marbre/plinthes, Menuiserie, Électricité… |
| `main_oeuvre` | Main d'œuvre | **hors SA** | Salaires, Main d'œuvre carreleur / maçon / peintre / ferraille, Manœuvre et aides… |
| `engins` | Engins & transport | **hors SA** | Livraison de matériels, Frais de chargement / déchargement, Ramassage / démolition… |
| `frais` | Frais & TVA | **hors SA** | Frais de dépôt, TVA, Remise (négatif)… |

> **4 familles proposées** (à valider — Q24). Le journal du CdG distingue **déjà** 3 blocs « financiers » ; `engins` est isolé pour permettre un futur suivi des engins (F06) et un suivi du carburant distinct des frais administratifs.

### 6.2 Modèle de données — **implémenté en F02-A v1**

**Décision du 16/10/2026 : le référentiel vit en code, pas en base.**

`shared/chargeNatures.ts` est la **source de vérité unique**. La colonne existante `purchase_request_lines.spend_category` (`schema.ts:602`, texte) **porte le code de la nature** : elle est déjà câblée de bout en bout (parse WhatsApp → route → requête → UI → indicateurs), donc **aucune migration de base n'est nécessaire**.

| Élément | Où | Rôle |
|---------|-----|------|
| `CHARGE_FAMILIES` | `shared/chargeNatures.ts` | Les **4 familles** : `materiaux`, `main_oeuvre`, `engins`, `frais` |
| `CHARGE_NATURES` | `shared/chargeNatures.ts` | Les **42 natures** : `value` (code stocké), `label` (canonique), `family`, `aliases` |
| `spend_category` | `purchase_request_lines` *(existant)* | Stocke le **code** de la nature |
| `EB_SPEND_CATEGORIES` | `shared/ebSpendCategory.ts` | Vue **matériaux** (23 natures) — rétrocompatibilité |
| `chargeNatureFamily()` · `isMaterialsNature()` | `shared/chargeNatures.ts` | Famille d'une nature · seule famille du circuit SA → BC |
| `rankFamilies()` · `byFamily` | `server/services/siteIndicators.ts` | Ventilation par famille + part du réalisé |

**Pourquoi pas de table `charge_natures` :** le référentiel est une **liste fermée** pilotée par le produit (§6.4), pas une donnée métier que le CdG édite. Une table n'apporterait qu'un seed à maintenir et un risque de **divergence** avec le code — exactement le problème que F02-A corrige par ailleurs.

**Rétrocompatibilité :** les **17 codes Koestrem** sont conservés **à l'identique** → **aucune ligne existante à migrer**.

#### 6.2.1 Ce qui est **différé** (F02-A.2)

| Élément de la v0.1 | Pourquoi différé | Déclencheur de bascule |
|--------------------|------------------|------------------------|
| Table `charge_natures` + colonne `charge_nature_id` | Le code suffit tant que la liste est fermée | Le CdG veut **ajouter ou renommer** une nature **sans déploiement** |
| CRUD du référentiel dans l'UI | Idem | Idem |
| Statut « à catégoriser » **persisté** | En saisie DT la liste est fermée ; une valeur inconnue retombe sur `autres_materiaux` | **T08** doit **conserver** la nature inconnue du journal — ✅ **fait** : la ligne historique stocke le code résolu **et** `nature_label`, le libellé d'origine du journal. Rien n'est perdu, même quand le rapprochement échoue |

### 6.3 Contenu — 42 natures (constante `CHARGE_NATURES`)

Le rapport du CdG classe **déjà** les 35 natures en 2 blocs (annexe §3D). Le référentiel reprend **ses libellés comme canoniques** et les libellés du journal comme **alias** — c'est la réponse structurelle au bug de libellés (piège n°3 de l'annexe).

**Total : 42 natures = 23 matériaux + 14 main d'œuvre + 3 engins + 2 frais.**

- **23 matériaux** = les **17 postes Koestrem 5.1 conservés à l'identique** + **6 postes du rapport CdG** qui n'y figuraient pas.
- **14 main d'œuvre** = les 13 postes du rapport + `mo_divers` (fourre-tout qui recueille l'ancienne famille aplatie `main_oeuvre`).
- **3 engins** = les 3 postes de transport du rapport.
- **2 frais** = `frais_depot` (66 occurrences dans le journal — cf. Q26) + `frais_divers` (fourre-tout).

**Bloc matériaux — 19 natures du rapport (60 755 281 F)**

`MARBRES/PLINTHES` · `MATERIELS DE CUISINE` · `MENUISERIE ALUMINIUM` · `MATERIELS MENUISERIE` · `MATERIELS DE PEINTURE` · `CAROCOL` · `MATERIELS DE CHARPENTERIE` · `MATERIELS ELECTRICITE` · `CIMENT` · `MATERIELS MACONNERIE` · `MATERIELS FERRAILLE` · `ACCESSOIRES MENUISERIE` · `SABLE` · `MATERIELS PLOMBERIE` · `EQUIPEMENT DE TRAVAIL` · `MATERIELS ETANCHEITE` · `PLATRES + MATERIELS DE PLATRE` · `MATERIELS NETTOYAGE` · `SAC VIDE`

**Bloc main d'œuvre / frais — 16 natures (9 709 150 F)**

`SALAIRES TECHNICIEN` · `CONFECTION DE VOLET` · `MAIN D'ŒUVRE MENUISIER` · `MAIN D'ŒUVRE PONCEUR` · `MAIN D'ŒUVRE CARRELAGE` · `RAMASSAGE/DEMOLITION ET DECAPAGE` · `POSE MARBRE/PLINTH` · `MAIN D'ŒUVRE ET AIDES` · `MAIN D'ŒUVRE PEINTRE` · `MAIN D'ŒUVRE FERRAILLE` · `MAIN D'ŒUVRE ALUCOBOND` · `FRAIS DE CHARGEMENT/DECHARGEMENT` · `DEPOSE GRANITE` · `MAIN D'ŒUVRE MACON` · `MAIN D'ŒUVRE ETANCHEITE` · `LIVRAISON MATERIELS`

**Exemples d'alias (journal → canonique)**

| Libellé du journal | Alias vers |
|--------------------|------------|
| `MENUISIRIE ALUMINUIN` | `MENUISERIE ALUMINIUM` |
| `MATERIELS DE NETOYAGE` | `MATERIELS NETTOYAGE` |
| `MATERIELS DE FERRAILLE` | `MATERIELS FERRAILLE` |
| `SALAIRES` | `SALAIRES TECHNICIEN` |
| `MATERIELS CHARPENTERIE` | `MATERIELS DE CHARPENTERIE` |
| `MANŒUVRE ET AIDES` | `MAIN D'ŒUVRE ET AIDES` |
| `POSE DE MARBRE/PLINTHES` | `POSE MARBRE/PLINTH` |
| `MAIN D'ŒUVRE CARRELEUR` | `MAIN D'ŒUVRE CARRELAGE` |
| `MAIN D'ŒUVRE ALUCONBOND` | `MAIN D'ŒUVRE ALUCOBOND` |

> **Les 17 valeurs Koestrem existantes** sont conservées **à l'identique** : elles restent des natures de famille `materiaux`. La rétrocompatibilité est donc **structurelle** (aucune migration de données), et non plus assurée par un champ `legacy_spend_category`.

**3 postes ambigus à arbitrer en séance (Q25) :** `CONFECTION DE VOLET`, `POSE MARBRE/PLINTH`, `DEPOSE GRANITE`.

### 6.4 Liste fermée ou « à catégoriser » (Q27)

| Option | Comportement | Retenue pour |
|--------|--------------|--------------|
| **Liste fermée** | Toute ligne doit porter une nature du référentiel. La saisie hors liste est **refusée**. | **Saisie directe dans TraceO** |
| **À catégoriser** | Une ligne importée avec un libellé inconnu est **acceptée** et marquée « à catégoriser ». | **Import Excel (T08)** |

**Règle retenue :** liste **fermée** en saisie directe, **tolérante** à l'import — toute nature inconnue produit une ligne **« à catégoriser »** visible du CdG, **jamais** une création silencieuse de nature.

> C'est ce qui évite de reproduire à l'échelle du groupe l'écart de 150 F causé par la dérive des libellés (`MENUISIRIE ALUMINUIN`, `MATERIELS DE NETOYAGE`…).

### 6.5 Écrans du lot A — **livrés**

| Écran | Rôle | Contenu | Repère |
|-------|------|---------|--------|
| Saisie / édition d'EB | `technical_director` | Sélecteur **nature groupée par famille** (`<optgroup>`) sur chaque ligne | `mgr-achats-line-category-{i}` |
| Filtre CdG | `controle_gestion` | Filtre **famille** puis filtre **nature** sur le suivi chantier | `mgr-cdg-filter-family`, `mgr-cdg-filter-category` |
| Indicateurs chantier | `controle_gestion`, `daf`, `pdg` | **Part des matériaux** (corrigée) + **ventilation par famille** | `mgr-cdg-families` |
| Budget vs réalisé par famille | `controle_gestion`, `daf`, `pdg` | **Drill-down par nature** (demande CdG, façon Feuil2) : ▸ déplie le réalisé d'une famille en lignes par nature (Σ = sous-total famille, I113) ; aucune enveloppe par nature | `mgr-cdg-variance-expand-{family}`, `mgr-cdg-variance-nature-{family}-{category}` |
| Référentiel (CRUD) | — | *Différé en F02-A.2* — voir §6.2.1 | — |

---

## 7. Lot B — Circuit « EB main-d'œuvre hors SA »

### 7.1 Circuit cible

```
DT saisit une EB (famille main d'œuvre / engins / frais)
        │
        ▼
   submitted ──▶ cdg_review              visa Contrôle de gestion
        │
        ▼
   daf_review                            visa DAF
        ├── montant > 500 000 F ──▶ pdg_review     visa PDG
        ▼
   bt_pending ──▶ bt_ready               BT trésorerie émis          [nouveau]
        │
        ▼
   deboursed                             déboursé : date, montant,
        │                                mode, n° Orange Money       [nouveau]
        ▼
   paid                                  facture attachée + imprimée [nouveau]
```

**Différence avec le circuit matériaux :** l'étape **`sa_review` est sautée** — le SA n'émet pas de BC pour une dépense de main-d'œuvre.

> **✅ Confirmé en séance CdG (16/10/2026)** — [annexe §6.2](./BTP-ANNEXE-ENTRETIEN-CDG.md) :
> - *« oui »* : une EB main-d'œuvre **saute toujours** le SA (pas de seuil) ;
> - *« On utilisera le BT généré automatiquement suite à l'approbation du DAF et/ou PDG »* : le BT est émis **après** l'approbation finance — et **non** au moment du visa DAF comme aujourd'hui (`procurementWorkflow.ts:124-126`) ;
> - *« oui mais pour changer dans le futur »* : le routage se fait **par la nature de charge**, avec une **surcharge manuelle** prévue en F02-B.2 ;
> - *« oui appliquer la même limite de 500k »* : le seuil **PDG 500 000 F** s'applique au montant de l'**EB** hors SA, **comme au BC** (`DEFAULT_BT_THRESHOLD_FCFA`, `server/config/procurement.ts:11`).

> **Aujourd'hui, ce circuit est impossible à exécuter :** `procurementWorkflow.ts:113` calcule `needsBt = supplierHasAccount === false` (donc **pas de BT** si aucun fournisseur), et `procurementWorkflow.ts:144-145` renvoie une erreur sur `sa_review` (*« Utilisez create-po pour générer le bon de commande »*).

### 7.2 Nouveaux statuts

| Statut | Libellé UI | Acteur | État |
|--------|------------|--------|------|
| `bt_pending` | BT en préparation | trésorerie | ✅ **existe déjà** dans `purchase_request_status` |
| `bt_ready` | BT émis — en attente de déboursé | trésorerie | 🆕 à ajouter |
| `deboursed` | Déboursé constaté | trésorerie | 🆕 à ajouter |
| `paid` | Payé — facture archivée | trésorerie / CdG | 🆕 à ajouter |

### 7.3 Nouveau rôle `treasury`

Ajout à `procurementRoleEnum` (`server/db/schema.ts:29`) : **`treasury`** — libellé UI **« Trésorerie »**.

| Peut | Ne peut pas |
|------|-------------|
| Voir les EB en `bt_ready` / `deboursed` / `paid` | Créer une EB |
| Saisir le déboursé (date, montant, mode, n° de transaction) | Modifier le montant de l'EB |
| Attacher la facture / le reçu | Approuver ou rejeter l'EB |
| Marquer la facture comme imprimée | Voir les EB en amont du BT |

### 7.4 Modèle de données

**Nouvelle table `treasury_disbursements`** — un déboursé par BT.

| Colonne | Type | Règle |
|---------|------|--------|
| `id` | text PK | |
| `company_id` | text | Isolation tenant |
| `treasury_order_id` | text FK `treasury_orders` | **Unique** — un déboursé par BT |
| `amount_fcfa` | numeric(14,0) | Peut être **≤** au montant du BT (paiement partiel) |
| `method` | enum `disbursement_method` | `orange_money` \| `cash` \| `bank` \| `cheque` |
| `transaction_reference` | text nullable | **Obligatoire si `orange_money`** (n° de transaction) |
| `paid_at` | timestamptz | Date du déboursé |
| `recorded_by_manager_id` | text FK `managers` | Rôle `treasury` |
| `invoice_blob_key` | text nullable | Pièce jointe — **miroir de `purchase_orders.sa_invoice_blob_key`** (`schema.ts:649`) |
| `invoice_file_name` | text nullable | |
| `invoice_content_type` | text nullable | |
| `invoice_printed_at` | timestamptz nullable | Trace de l'impression physique (Q56) |
| `created_at` | timestamptz | |

**Nouvel enum `disbursement_method`** : `orange_money`, `cash`, `bank`, `cheque`.

**Colonne ajoutée sur `treasury_orders`** (`schema.ts:665`) :

| Colonne | Type | Règle |
|---------|------|--------|
| `status` | enum `treasury_order_status` | `pending` \| `issued` \| `deboursed` \| `paid` \| `cancelled` |

> **Justification du miroir `sa_invoice_*` :** le pattern « pièce jointe sur un document » **existe déjà** dans le code (`purchase_orders`, `purchase_request_lines`). F02-B le réutilise au lieu d'inventer un nouveau mécanisme d'upload.

> **✅ Règle confirmée en séance CdG (16/10/2026)** — [annexe §6.2](./BTP-ANNEXE-ENTRETIEN-CDG.md) :
> *« Au déboursé et exiger de joindre la facture »* et *« il faut juste rattacher la facture du paiement à l'EB »*.
>
> - La facture est **exigée au moment du déboursé** (invariant **I103**) — pas à la création de l'EB ;
> - elle doit être **consultable depuis l'EB** (chaîne `EB → BT → déboursé → facture`), pas seulement depuis le poste Trésorerie ;
> - **un seul document** : la pièce jointe **est** le justificatif, il n'y a **pas** de double archivage imprimé ;
> - mode de paiement : **Orange Money** ou **autre reçu** (pièce libre, pas seulement OM).

### 7.5 Règle de routage (invariant I102)

```
familleDesLignes(EB) ∈ { main_oeuvre, engins, frais }  ──▶  EB hors SA
familleDesLignes(EB) =  materiaux                       ──▶  circuit SA → BC (inchangé)
```

- **Une EB est mono-famille de routage.** Si elle mélange matériaux et main d'œuvre, elle est **scindée** ou **refusée** — à trancher (Q49, invariant **I105**).
- Le routage est calculé **à la soumission** (`submitted`), sur la **famille majoritaire en montant**, avec **alerte** si la ventilation est mixte.
- **Justification :** la famille est la **seule** clé qui distingue objectivement une dépense de main-d'œuvre d'un achat de matériaux. Router par mot-clé reproduirait le bug de libellés de l'écart de 150 F.

### 7.6 Impact sur les indicateurs (invariant I100)

| Indicateur | Formule | Impact F02-B |
|------------|---------|--------------|
| **Engagé** | Σ BC validés (F01) | **Inchangé** — une EB hors SA n'entre **pas** dans l'engagé |
| **Réalisé** | Σ BC **livrés** | **+** Σ EB hors SA **payées** (`paid`) → le réalisé devient vrai |
| **Part des matériaux** | Σ lignes famille `materiaux` ÷ Σ lignes | **Corrigée** par le lot A |
| **Reste à engager** | `budget_total − engagé` | **Inchangé** |

> **Chiffrage du besoin :** sur le journal du CdG, **11 476 531 F** (192 lignes) portent un n° de BC, contre **58 988 050 F** (315 lignes) hors BC. Sans F02-B, le réalisé d'un chantier ne verrait qu'environ **16 %** de ses dépenses réelles — l'écart de F03 serait un **angle mort**, pas un écart.

> **✅ Confirmé en séance CdG (16/10/2026) — « *il s'agit des mêmes* » :** les **192 lignes qui portent un n° de BC sont déjà les achats saisis en BC dans TraceO**. Le réalisé doit donc être **dé-dupliqué par référence de BC** : ces 11 476 531 F ne s'ajoutent **jamais** aux BC livrés. **I100 est bloquant**, pas une alerte.
>
> *Sans cette garde, le réalisé d'un chantier serait surévalué de 16 % — et l'écart de F03 deviendrait un faux signal d'alerte.*

### 7.7 Écrans du lot B — **livrés**

| Écran | Rôle | Contenu | Repère |
|-------|------|---------|--------|
| File de validation | `controle_gestion` | EB en `cdg_review` hors SA — visa / rejet motivé | `AchatsTab` (existant) |
| File de validation | `daf` / `pdg` | EB hors SA selon le seuil 500 000 F | `AchatsTab` (existant) |
| **Poste Trésorerie** | `treasury` | BT à débourser · formulaire (montant, mode, n° OM, date) · **upload facture obligatoire** · lien facture | `mgr-tresorerie-tab` |
| Chaîne documentaire | rôles habilités | `EB → BT → **déboursé** → facture` — le déboursé et sa facture s'ajoutent à la chaîne | `mgr-chain-disbursement-{id}`, `mgr-chain-invoice-{id}` |
| Indicateurs chantier | CdG, DAF, PDG | **Réalisé = BC livrés + EB hors SA payées** | `siteIndicators` |

**Couverture e2e** (`btp-procurement.spec.ts` — « F02-B — circuit hors SA ») : EB main-d'œuvre → soumission → chiffrage SA → CdG → **DAF → `bt_ready`** (jamais `sa_review`) → file Trésorerie → déboursé **refusé sans facture (400)** → **accepté avec facture (201)** → facture rattachée à l'EB → BT sorti de la file → onglet `mgr-tab-tresorerie` ouvert pour le rôle `treasury`.

**Réalisé (F02-B.3) :** `listSiteDirectExpenseEvents()` ajoute au réalisé les déboursés du chantier, datés du paiement et ventilés sur les lignes de l'EB au prorata du montant payé (paiement partiel supporté). Sans cette source, un chantier dont la main-d'œuvre est payée hors SA n'afficherait que ses achats matériaux.

### 7.8 API livrée (F02-B.2)

| Méthode | Route | Rôle | Rôle fonctionnel |
|---------|-------|------|------------------|
| `GET` | `/procurement/treasury` | `treasury`, `controle_gestion`, `daf`, `pdg` | File des BT à débourser (statut BT `pending`/`issued` **et** EB en `bt_pending`/`bt_ready`/`deboursed`) |
| `POST` | `/procurement/treasury/:id/disburse` | `treasury` | Enregistre le déboursé — **facture exigée (I103)**, supprimée si l'enregistrement échoue |
| `GET` | `/procurement/treasury/:id/invoice` | rôles achats | Télécharge la facture / le reçu |
| `POST` | `/procurement/treasury/:id/invoice` | `treasury` | Remplace la facture (mauvaise pièce) |
| `POST` | `/procurement/treasury/:id/invoice-printed` | `treasury` | Trace l'impression physique (Q56) |
| `GET` | `/procurement/requests/:id/disbursements` | rôles achats | Déboursés d'une EB — la facture est **consultable depuis l'EB** |

**Machine à états livrée** (`procurementWorkflow.ts`) :

| Statut EB | Approbateur | Transition |
|-----------|-------------|------------|
| `cdg_review` | `controle_gestion` | → `daf_review` |
| `daf_review` | `daf` | **hors SA** : → `pdg_review` si ≥ 500 000 F, sinon **BT émis** → `bt_ready`<br>**matériaux** : circuit inchangé (`daf_bt_review` / `pdg_review` / `sa_review`) |
| `pdg_review` | `pdg` | **hors SA** : → **BT émis** → `bt_ready`<br>**matériaux** : → `sa_review` |
| `bt_ready` | `treasury` | → `deboursed` (déboursé + facture) |
| `deboursed` | `treasury` | → `paid` quand **tous** les BT de l'EB sont déboursés |

> **Garde de non-régression :** la régénération automatique des BT existants après approbation est **désactivée sur le circuit hors SA** — elle écraserait un BT de ligne avec le total de l'EB. Voir `procurementWorkflow.ts` (`if (!horsSa)`).

---

## 8. Invariants

| ID | Invariant | Lot |
|----|-----------|-----|
| **I98** | **Cohérence du bordereau** : `computedTotal = Σ lignes` ; l'écart avec le total déclaré est affiché poste par poste | T08 — **non implémenté** : le journal du CdG ne porte **aucun total déclaré** à confronter (déclencheur : un bordereau chiffré joint au fichier) |
| **I99** | **Idempotence du ré-import** : rejouer le même fichier ne crée **aucun doublon** | ✅ **T08** — `shared/cdgJournal.test.ts` · `btp-procurement.spec.ts` « T08 » (2ᵉ import → `imported: 0`, `skipped: 2`) |
| **I100** | **Non-recouvrement BLOQUANT** : une dépense directe dont le `No BC` correspond à un `purchase_orders.reference` **existant** n'est **jamais** recomptée (refus à l'import) ; une dépense **sans** BC entre dans le réalisé, jamais dans l'engagé | **F02-B** |
| **I101** | **Cloisonnement** : le DT ne peut pas contrôler, le CdG ne peut pas créer, un autre tenant reçoit **404/403** | **F02-A / B** |
| **I102** | **Routage par la nature** : famille `main_oeuvre` / `engins` / `frais` ⇒ saut du SA **et** BT trésorerie ; `materiaux` ⇒ circuit SA → BC | **F02-B** |
| **I103** | **Facture obligatoire avant déboursé** : aucun paiement hors SA sans **pièce jointe** attachée | **F02-B** |
| **I104** | **Nature obligatoire en saisie** : toute ligne d'EB saisie dans TraceO porte une `charge_nature_id` (liste fermée) | **F02-A** |
| **I105** | **Famille unique** : une EB hors SA ne peut pas contenir de ligne de famille `materiaux` | **F02-B** |
| **I106** | **Rapprochement journal ↔ BC** : le taux de rapprochement (lignes rapprochées ↔ lignes hors BC) est **calculé et affiché** avant tout import ; un écart non expliqué est **signalé** — les lignes à BC restant **exclues** par défaut (I100), jamais importées « faute de mieux » | ✅ **T08** — `previewCdgJournalApi` (n'écrit rien) · `btp-procurement.spec.ts` « T08 » (`matchRatePct = 10.6`, `unmappedBcReferences`) |
| **I110** | **Rejeu réversible** : chaque import forme un **lot** (`batch_id`) annulable par le CdG seul ; annuler retire **exactement** ses lignes du réalisé | ✅ **T08** — `btp-procurement.spec.ts` « T08 » |

> La numérotation libre commence à **I98** (I01–I97 sont pris — voir `e2e/INVARIANTS.md`).

---

## 9. Lots, charge et enchaînement

| Lot | Contenu | Dépend de | Charge indicative | État |
|-----|---------|-----------|-------------------|------|
| **F02-A** | Référentiel natures + familles · sélecteur DT · filtre CdG · part matériaux corrigée · invariant I104 | F01.1 | **2–3 j** | ✅ **livré** |
| **F02-B.1** | Routage (`shared/chargeFlow.ts`) · migration (rôle `treasury`, 3 statuts, `treasury_disbursements`) · schéma · types | F02-A | **2 j** | ✅ **livré** |
| **F02-B.2** | Machine à états hors SA · `disburseTreasuryOrder` (I103) · 6 routes · invariants I102/I103/I105 | F02-B.1 | **3 j** | ✅ **livré** |
| **F02-B.3** | **UI poste Trésorerie** · formulaire de déboursé · upload facture · chaîne documentaire · réalisé | F02-B.2 | **2–3 j** | ✅ **livré** |
| **F03** | Budget vs réalisé · référentiel DQE · écart par ouvrage | F01 + F02 | **5 j** | ⏸️ |
| **T08** | **Rejeu** de l'historique du CdG — lignes **hors BC uniquement** (§5.3) | F02-A + F01 | **2 j** | ✅ **livré** |

**T08 — ce qui a été livré** (aucune migration de données, une seule table neuve) :

| Élément | Où |
|---|---|
| Parsing + rapprochement **purs** (en-tête détecté, repli positionnel A → J, dates FR / série Excel / ISO, montants `12 500,50`) | `shared/cdgJournal.ts` + **15 tests** |
| Table `historical_expense_lines` — unicités `(company, source, source_ref)` (I99), index chantier | migration `20261019120000_t08_historical_expenses` |
| `POST /historical-expenses/preview` (**n'écrit rien**) · `POST /historical-expenses/import` · `GET` · `DELETE /:batchId` | `server/routes/procurement.ts` — rôle **CdG** |
| Réalisé : les lignes hors BC rejoignent `listSiteDirectExpenseEvents` — **un seul réalisé** (I108) | `server/db/procurementQueries.ts` |
| Écran CdG : fichier lu **dans le navigateur** (`xlsx`), aperçu chiffré, ventilation par famille, lots annulables | `src/pages/manager/procurement/CdgHistoricalCard.tsx` |

**Décision structurante :** ces lignes sont des **faits datés**, **pas** des documents du circuit. Fabriquer de vraies EB pour l'historique produirait une chaîne d'approbations que **personne n'a signée** — un mensonge dans la piste d'audit. Elles alimentent donc le réalisé **comme le ferait un déboursé**, sans workflow ni signature.

**Enchaînement :**

```
F01.1  ──▶  F02-A  ──▶  [réunion CdG]  ──▶  F02-B  ──▶  T08  ──▶  F03
```

### 9.1 Pourquoi F02-A avant F02-B

La **famille est la clé de routage** (§7.5). Sans référentiel de natures, la règle « hors SA » n'a **rien** sur quoi s'appuyer et retomberait sur une détection par mot-clé — exactement le mécanisme qui a produit l'écart de 150 F entre le journal et le rapport.

### 9.2 Pourquoi F02-A avant T08

L'import lit la colonne `Nature de dépense` (35 valeurs, avec dérive de libellés). Importer **avant** d'avoir le référentiel, c'est créer 508 lignes à libellé libre et **institutionnaliser** le bug de pivot par chaîne de caractères.

### 9.3 Pourquoi F02-B avant F03

F03 compare une **enveloppe** à un **réalisé**. Aujourd'hui le réalisé ne voit que les BC livrés : sur le journal du CdG, **16 % des dépenses**. F03 afficherait donc un écart de plusieurs dizaines de millions qui ne serait **pas** un écart, mais un **angle mort**.

---

## 10. Décisions CdG — état au 16/10/2026

Réponses brutes et analyse détaillée : [annexe §6](./BTP-ANNEXE-ENTRETIEN-CDG.md#6-réponses-du-cdg--séance-du-16-octobre-2026).

| # | Point | Question | État | Réponse |
|---|-------|----------|------|---------|
| 1 | **Familles** | 4 familles ou 3 ? | ✅ **livré** | 4 familles (proposé par F02-A, non contesté) |
| 2 | **3 postes ambigus** | `CONFECTION DE VOLET`, `POSE MARBRE/PLINTH`, `DEPOSE GRANITE` | ⚠️ **ouvert** | non abordé — classés `main_oeuvre` par défaut |
| 3 | **Liste fermée** | Interdire la saisie hors référentiel ? | ✅ **livré** | liste fermée en saisie directe (F02-A) |
| 4 | **Clé de routage** | Nature de charge, ou case cochée par le DT ? | ✅ **tranché** | **par la nature** ; « pour changer dans le futur » → surcharge prévue en F02-B.2 |
| 5 | **Ordre des visas** | CdG **avant** ou **après** le DAF ? | ✅ **tranché** | **CdG → DAF/PDG → BT automatique** |
| 6 | **Seuil PDG** | 500 000 F applicable au montant de l'**EB** hors SA ? | ✅ **tranché** | **oui — même limite de 500 000 F** que le BC |
| 7 | **Rôle trésorerie** | Rôle TraceO `treasury`, ou fusion avec `accountant` ? | ✅ **tranché** | **créer un rôle « Trésorerie »** |
| 8 | **Orange Money** | Toujours OM ? N° de transaction obligatoire ? | ✅ **tranché** | **OM ou autre reçu** — pas de n° de transaction exigé |
| 9 | **Facture** | Jointe à l'EB ? Imprimée aussi ? | ✅ **tranché** | jointe **à l'EB**, exigée **au déboursé**, **pas** de double archivage |
| 10 | **EB mixte** | Scinder ou refuser une EB matériaux + main d'œuvre ? | ⚠️ **ouvert** | non abordé — invariant **I105** à confirmer |
| 11 | **Double comptage journal ↔ BC** | Les 192 lignes qui portent un n° de BC sont-elles **déjà** dans TraceO ? | ✅ **tranché** | **OUI** — « il s'agit des mêmes » → **I100 bloquant**, **I106** |

### 10.1 Restent ouverts avant F02-B

1. **Point 2** — famille des 3 postes ambigus (`CONFECTION DE VOLET`, `POSE MARBRE/PLINTH`, `DEPOSE GRANITE`).
2. **Point 6** — le **seuil PDG 500 000 F** s'applique-t-il au montant de l'**EB** hors SA comme au BC ?
3. **Point 10** — **EB mixte** matériaux + main d'œuvre : scinder ou refuser ?
4. **Q60** — suivi des **avances** (« *Comprends pas* ») : question à reformuler.

> **Tranché et clos (point 11) :** « *il s'agit des mêmes* » = **les mêmes dépenses**. Les **192 lignes portant un n° de BC sont déjà dans TraceO** → **I100 bloquant** + **I106** (voir [annexe §6.4](./BTP-ANNEXE-ENTRETIEN-CDG.md)).

---

## 11. Traçabilité CDC

| Exigence CDC | Où c'est traité | Lot |
|--------------|-----------------|-----|
| F02 — « imputation chantier × nature de charge » | §6 | **A** |
| F02 — référentiel des natures | §6.2, §6.3 | **A** |
| F02 — ventilation CdG par nature | §6.5 | **A** |
| *(extension)* dépenses de main-d'œuvre hors SA | §7 | **B** |
| F03 — budget vs réalisé | — | F03 |
| T08 — import de l'historique | — | T08 |

**F01 → F02 :** F01 §1 délègue explicitement *« Main-d'œuvre, engins et frais généraux : hors F01 (voir F02) »* — le **lot B** honore cette délégation.

**F02 → F03 :** F03 consomme `budget_total` / `engagé` de F01 **et** le réalisé de F02-B. Sans F02-B, F03 compare une enveloppe à un réalisé amputé de ~84 % des dépenses.

**F02-A → T08 :** l'import a besoin du référentiel pour rattacher les 35 natures du journal (§6.3) — sinon le pivot se fait sur des libellés libres.

---

## 12. Points ouverts

- **Contenu exact des 35 natures** : dépend de la réunion CdG (annexe §3D) — la *structure* du référentiel ne dépend pas de sa réponse.
- **Rôle `accountant`** : existe déjà dans `procurementRoleEnum` (`schema.ts:37`) — faut-il le **fusionner** avec `treasury` plutôt que créer un nouveau rôle ? *(à trancher, §10 point 7)*
- **`engins` vs `frais`** : le journal du CdG ne distingue pas les deux blocs ; leur séparation est une **proposition**, pas un constat.
- **Montants négatifs** : 3 lignes `REMISE` (−523 017 F) — une nature de famille `frais` accepte-t-elle un montant négatif ? *(cf. annexe Q7)*
- **Bénéficiaire sans fournisseur** : `needsBt` (`procurementWorkflow.ts:113`) repose sur `supplierHasAccount === false`. Pour une EB hors SA, il n'y a **pas** de fournisseur — la règle de génération du BT doit donc être **étendue** (BT si `flow = hors_sa`, indépendamment du fournisseur).
- **Portée de T08 revue le 16/10/2026** : le fichier du CdG étant une **compilation** et non une source (§5.3), T08 se limite au **rejeu des 315 lignes hors BC**. Si le CdG veut conserver son fichier comme **sortie** de TraceO, c'est **F03** qu'il faut livrer — pas un import.
- **Le fichier comme « golden file »** : il fournit un **jeu de recette gratuit** pour F03 (10 colonnes, 35 natures, 2 blocs, totaux vérifiables au franc près). À réutiliser comme test d'acceptation.