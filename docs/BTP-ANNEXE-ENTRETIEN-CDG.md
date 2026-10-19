# Annexe d’entretien — Contrôleur de gestion : dépenses chantier hors SA

**Version :** 1.1 — 16 octobre 2026 *(v1.0 : 13 octobre 2026)*
**Objet :** préparer la réunion CdG pour cadrer **F02** — natures de charge *(lot A)* et dépenses chantier hors SA *(lot B)*
**Sources analysées :** `docs/originaux/DG CI ENERGIE (version 1).xlsx` — journal **508 lignes**, **70 464 581 FCFA**, 5 mois, **fichier avec en-têtes reçu le 16/10/2026** · `docs/originaux/DQE_AYALO.xlsx` (devis **277 lignes** + feuille de synthèse)
**Statut :** document de travail — **à annoter en séance par le CdG**

> **Ce qui change en v1.1** (le fichier reçu le 16/10/2026 porte enfin une **ligne d'en-tête**) :
>
> 1. **les 10 colonnes sont identifiées** → le piège n°1 est **résolu**, ce n'est plus une question ;
> 2. **double comptage chiffré** : **192 lignes / 11 476 531 F** portent un n° de BC ↔ **315 lignes / 58 988 050 F** n'en portent pas ;
> 3. les **37 valeurs de la colonne D sont des n° de BC** (`purchase_orders.reference`), **pas** des codes chantier ;
> 4. les **11 valeurs de la colonne B sont des fournisseurs** (`Nom fournisseur`), **pas** des bénéficiaires ;
> 5. les **35 natures sont pré-classées** par le rapport : **19 matériaux (60 755 281 F)** + **16 main-d'œuvre / frais (9 709 150 F)** ;
> 6. **13 nouvelles questions (Q48–Q60)** sur le circuit hors SA, la trésorerie, le déboursé et la facture.

**Documents liés :** [Index BTP](./BTP-INDEX.md) · [Spéc. F01](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md) · [Circuit achats](./BTP-REGLES-CIRCUIT-ACHATS.md) · [Retex finance](./BTP-RETEX-QUESTIONNAIRE-FINANCE-2026.md) · [Invariants E2E](../e2e/INVARIANTS.md)

> **But de la réunion :** ne pas demander au CdG de *décrire son métier*, mais de **trancher des cas concrets** tirés de son propre fichier. Chaque question est adossée à une valeur réelle du journal.

---

## 0. Mode d’emploi

| Étape | Durée | Support |
|-------|-------|---------|
| Les **3 pièges** (§1) | 15 min | `DG CI ENERGIE.xlsx` ouvert à l’écran |
| **Guide d’entretien** (§2) — **60 questions** | 40 min | ce document, thème par thème |
| **Remplir les annexes** (§3) | 20 min | §3A à §3G imprimés |
| **Checklist de sortie** (§4) | 5 min | §4 |

**À apporter :** les 2 fichiers Excel · un **fichier « sale »** supplémentaire (avec anomalies) · ce document imprimé · les tableaux du §3.

**Règle d’or :** pour chaque question, ouvrir **une ligne réelle** du journal et demander *« celle-là, elle va où ? »*. On obtient en 30 secondes ce qu’une question ouverte n’obtiendrait pas en 20 minutes.

**Les 5 livrables attendus en fin de réunion :**

1. **sémantique des 10 colonnes** du journal (§3A) — *v1.1 : déjà établie depuis l'en-tête, il ne reste qu'à la **confirmer*** ;
2. **mapping des 37 n° de BC** → `purchase_orders.reference` TraceO (§3B) ;
3. **grille des 35 natures** validée + famille — *v1.1 : **pré-classée** 19 matériaux / 16 main-d'œuvre-frais* (§3D) ;
4. **règle de contrôle des totaux** (blocage / alerte / tolérance) (§3G) ;
5. **circuit hors SA** : qui valide, seuil PDG, déboursé, Orange Money, facture (§2, thème 9).

---

## 1. Les 3 pièges à trancher en priorité

### Piège n°1 — ✅ **RÉSOLU** : A dit le **chantier**, D le **BC**, E la **facture**

Le fichier v1 (reçu le 16/10/2026) porte une **ligne d'en-tête** : les 10 colonnes sont **nommées**, plus déduites.

| Col | **En-tête du fichier** | Nature réelle | Valeurs observées |
|-----|------------------------|---------------|-------------------|
| **A** | `Nom Chantier` | **chantier** (2 graphies) | `DG CI ENERGIE` (503) · `CI ENERGIE DG` (5) |
| **B** | `Nom fournisseur` | **fournisseur / bénéficiaire** | 11 valeurs, 185 lignes remplies |
| **C** | `Nature de dépense` | **nature de charge** | 35 valeurs, 508 lignes remplies |
| **D** | `No BC` | **n° de bon de commande** | 37 valeurs, **192 lignes** → à rapprocher de `purchase_orders.reference` |
| **E** | `No Facture ou BL` | **pièce justificative** | 25 valeurs, 120 lignes |
| **F** | `Date` | date d'opération | 69 jours distincts, 02/03 → 31/07/2026 |
| **G** | `Designation` | libellé libre | 397 libellés distincts |
| **H** | `Qte` | quantité | 191 lignes remplies |
| **I** | `PU` | prix unitaire | 181 lignes remplies |
| **J** | `Montant` | **montant FCFA** | 508 lignes, **70 464 581** |

**Ce qui reste à trancher — et c'est la seule vraie question d'imputation :**
la colonne A ne contient que **2 graphies d'un même nom de chantier**. Le journal est donc **mono-chantier**, et il n'existe **aucun code d'affaire** dans le fichier. Or il cite **37 n° de BC**.

**Question à poser :** *« Votre journal porte le nom d'un seul chantier, mais 37 n° de BC. Ces BC sont-ils **tous** sur ce chantier, ou le journal couvre-t-il **plusieurs** chantiers qu'il faut déduire du n° de BC ? »*

**Impact :** c'est la clé de **toute** l'imputation chantier. Réponse attendue en **§3B**.

### Piège n°2 — Double comptage avec les BC : **désormais chiffré**

La colonne `No BC` permet enfin de **mesurer** le recouvrement :

| Population | Lignes | Montant FCFA | Part |
|------------|-------:|-------------:|-----:|
| Lignes **avec** n° de BC (col D) | **192** | **11 476 531** | 16 % |
| Lignes **sans** BC | **315** | **58 988 050** | 84 % |
| **Total** | **508** | **70 464 581** | 100 % |

**5 des 11 fournisseurs du journal sont déjà fournisseurs du catalogue BC de TraceO** (source : `shared/btpCatalogFromBcRegister.ts`) : `UBH 1` / `UBH 2` (= `UBH 01` / `UBH 02`), `OUSMANE`, `SOGELUX`, `EGEDY` (= `EGGEDY`) — et probablement un **6ᵉ** : `MIA` ≈ `MIA SEIGNEURIE`.

**✅ Tranché en séance (16/10/2026) — voir §6 :**

1. Les **192 lignes qui portent un n° de BC (11 476 531 F)** **sont** les achats **déjà saisis en BC dans TraceO** → elles ne doivent **jamais** être recomptées. **I100 est bloquant.**
2. Les **315 lignes sans BC (58 988 050 F, 84 % des montants)** sont les **dépenses réelles hors BC** — c'est ce que TraceO doit capter.

**Impact :** c'est la règle de **non-recouvrement** (invariant **I100**). Sans réponse, le coût réel d'un chantier peut être **doublé** (BC + dépense) — ou **sous-estimé** si l'on suppose à tort que tout est déjà dans les BC.

### Piège n°3 — L’écart de 150 FCFA (déjà décomposé)

| Poste | Journal (Feuil1) | Rapport (Feuil2) | Écart |
|-------|------------------|------------------|-------|
| MANŒUVRE ET AIDES → MAIN D’ŒUVRE ET AIDES | 391 370 | 391 310 | **−60** |
| POSE DE MARBRE/PLINTHES → POSE MARBRE/PLINTH | 440 210 | 440 120 | **−90** |
| **TOTAL** | **70 464 581** | **70 464 431** | **−150** |

*Les totaux du rapport sont **auto-cohérents** (Σ de ses **35 postes** = ses totaux par famille). L’écart est donc **entre le journal et le rapport**, et il est **localisé sur 2 postes**.*

**Recalcul indépendant (16/10/2026, fichier v1) :** écart **confirmé à −150 F**, et **uniquement** sur ces 2 postes — les 33 autres postes sont **identiques au franc près**. Les deux écarts sont des **erreurs de saisie** (`391 370 → 391 310` et `440 210 → 440 120`), **pas** un problème de libellés.

**Question à poser :** *« Votre rapport est inférieur de 150 F au détail, en deux postes : −60 sur MANŒUVRE ET AIDES, −90 sur POSE DE MARBRE/PLINTHES. Erreur de saisie, arrondi volontaire, ou correction manuelle ? Si TraceO affiche « écart détecté : 150 F — postes concernés : … », vous voulez **blocage**, **alerte** ou **tolérance** ? »*

**Impact :** c’est le **contrôle de cohérence du bordereau** (invariant I98) — et un cas de test gratuit.

---

## 2. Guide d’entretien — 60 questions

> **Routage des questions par fonctionnalité** (ne pas mélanger les sujets en séance) :
>
> | Thèmes | Fonctionnalité visée | Décision attendue |
> |--------|----------------------|-------------------|
> | **1, 4** (colonnes, natures) | **F02 — lot A** (natures de charge) | référentiel + liste fermée ou à catégoriser |
> | **9** (circuit hors SA) | **F02 — lot B** (dépenses hors SA) | visas, seuil PDG, trésorerie, déboursé, facture |
> | **3, 6** (main-d'œuvre, seuils) | **F02 — lot B** | référentiel bénéficiaires, droits, gouvernance |
> | **5** (budget, DQE) | **F03** (budget vs réalisé) | référentiel DQE, imputation par ouvrage |
> | **8** (le fichier) | **T08** (import Excel) | modèle d'import imposé ou toléré |
> | **2, 7** (process, cible) | **F02 / F03** | périodicité, restitutions, priorité |

### Thème 1 — Sémantique du journal (les colonnes)

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q1** | Col A : `DG CI ENERGIE` (503 lignes) et `CI ENERGIE DG` (5 lignes) — **deux sociétés** du groupe, ou deux écritures du **même** chantier ? | entité émettrice / multi-sociétés |
| **Q2** | Col B : `UBH 1` et `UBH 2`, c’est une **équipe**, un **magasin**, un **chef d’équipe** ? | type de bénéficiaire |
| **Q3** | `MIA`, `UI`, `MAGMA`, `ABASS`, `MUR ET SOL`, `KONE MORY` : employés, artisans, fournisseurs, particuliers ? | référentiel bénéficiaires |
| **Q4** | Col C : la liste de **saisie** n’est pas la liste du **rapport** (`SALAIRES` → `SALAIRES TECHNICIEN`, `MENUISIRIE ALUMINUIN` → `MENUISERIE ALUMINIUM`, `MATERIELS DE NETOYAGE` → `MATERIELS NETTOYAGE`, `MATERIELS FERRAILLE`). **Qui renomme, et selon quelle règle ?** | normalisation des natures |
| **Q5** | Col F : c’est la date de **la dépense** ou du **paiement** ? | date d’imputation budgétaire |
| **Q6** | `TVA/MIA` (229 248) et `TVA/MAGMA` (3 801 690) : la TVA est **incluse** dans les montants ? Faut-il HT / TVA / TTC séparés ? | comparabilité BC ↔ dépenses |
| **Q7** | `REMISE` : **3 lignes négatives** (−523 017 F). Y a-t-il d’autres cas de lignes négatives (avoir, retour, régularisation) ? | montants négatifs autorisés |
| **Q8** | Col H/I : **319 lignes sur 508 sans quantité**, **329 sans prix unitaire** (63 % / 65 %). Qté et PU sont donc **optionnels** ? | champs obligatoires |
| **Q9** | Col G : `ACHAT DE 18 CLE ROSACES/PRIX UNITAIRE 18000` — quand le PU est **dans le libellé**, faut-il le ressaisir en colonne ? | discipline de saisie |
| **Q10** | Col E : conservez-vous l’**original** (papier / photo) de chaque pièce ? Qui l’archive, et combien de temps ? | justificatifs + photo du reçu |

### Thème 2 — Le processus DT → CdG

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q11** | Le fichier couvre **02/03 → 31/07/2026** (5 mois) : transmission **mensuelle cumulée**, rattrapage, ou à la demande ? | périodicité du bordereau |
| **Q12** | Le DT produit-il **toujours ce format** ? Avez-vous d’autres modèles (par chantier, par mois, par société) ? | variabilité des formats |
| **Q13** | Quels **contrôles** faites-vous aujourd’hui sur le fichier reçu ? Sur quoi **bloquez-vous** une ligne ? | règles de contrôle |
| **Q14** | Comment **corrigez-vous une erreur** : retour au DT, ou correction chez vous ? | statut « renvoyé au DT » |
| **Q15** | **Ressaisissez-vous** ces données ailleurs (comptabilité, tableau de bord) ? Combien de temps cela vous prend-il ? | gain attendu (argument de valeur) |
| **Q16** | Le **pic de mars** (25 711 020 F) contre **4 M** en avril : démarrage de chantier, ou rattrapage d’antériorité ? | règle de rattachement de période |
| **Q17** | Un bordereau peut-il couvrir **plusieurs chantiers** (le vôtre en couvre **37**) ? | `siteId` porté par la ligne |

### Thème 3 — Employés et main d’œuvre

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q18** | *« Recenser les dépenses effectuées pour les employés »* : voulez-vous un **cumul par personne** (qui a reçu combien, sur quelle période) ? | rapport par bénéficiaire |
| **Q19** | Y a-t-il des **avances** à suivre avec un **reste à payer**, ou tout est soldé au fil de l’eau ? (`AVANCE N°1 POUR LA PRESTATION DE L’EBENISTE ALOU` 300 000 · `AVANCE POUR TRAVAUX DE CONFECTION DE VOLET ÉLECTRIQUE — CONTRAT 2 090 000` 1 500 000) | suivi avance / solde |
| **Q20** | Existe-t-il un **taux journalier de référence** par métier ? (`06 AIDES 24000` · `03 CARRELEURS 24000` · `CONTRAT JOURNALIER 36000 CFA`) | barème journalier |
| **Q21** | Les « employés » sont-ils **salariés**, **journaliers**, **tâcherons**, ou **sous-traitants** sous contrat ? | nature du lien |
| **Q22** | Faut-il un **matricule** par personne, ou le nom suffit-il ? | identifiant personne |
| **Q23** | Les noms doivent-ils être visibles de **tous** les rôles, ou réservés au DT / CdG ? | confidentialité |

### Thème 4 — Catégories / natures de charge

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q24** | Les **35 natures** du journal sont-elles la bonne grille, ou faut-il la **réduire** (≈ 15 postes consolidés) ? | granularité du référentiel |
| **Q25** | `CONFECTION DE VOLET`, `POSE DE MARBRE/PLINTHES`, `DEPOSE DE GRANITE` : **matériaux** ou **main d’œuvre** ? (le rapport classe `POSE MARBRE/PLINTH` en *financier*, le journal le nomme comme un matériau) | arbitrage des familles |
| **Q26** | `FRAIS DE DEPOT` apparaît **66 fois** (50 340 F) mais n’est **pas** une des 35 natures : c’est une **nature** ou un **libellé** ? | nature vs libellé |
| **Q27** | Faut-il **interdire** la saisie d’une nature hors liste (liste fermée), ou autoriser « à catégoriser » ? | contrôle de saisie |
| **Q28** | Les **17 natures matériaux** déjà dans TraceO (catalogue chantier) doivent-elles **absorber** ces 35, ou rester séparées ? | unicité du vocabulaire |

### Thème 5 — Budget, DQE et rapprochement

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q29** | Le `DEPENSES REEL FCFA = 33 650 337` du DQE AYALO : **qui le calcule, à partir de quoi** ? Est-ce un extrait de ce même journal, sous un code chantier ? | source du « réel » |
| **Q30** | AYALO (maternité, marché public — ministère de la Santé) : les dépenses du journal sont-elles **du même chantier** que le DQE, ou deux périmètres distincts ? | périmètre public / privé |
| **Q31** | Ces dépenses consomment-elles **l’enveloppe budgétaire** (F01) ou le **déboursé sec** ? | imputation budgétaire |
| **Q32** | Voulez-vous reproduire le **budget de référence par chantier** (prévisions DQE / marché) et l’**écart** dans TraceO ? | F03 budget vs réalisé |
| **Q33** | Voulez-vous imputer chaque dépense à un **n° de prix / ouvrage** du DQE (col. *N° DES PRIX*), en plus de la nature de charge ? | imputation fine par ouvrage |
| **Q34** | Le PU d’une dépense doit-il être **comparé** au *PRIX UNIT* du marché (contrôle de prix) ? | contrôle du prix unitaire |

### Thème 6 — Contrôle, seuils, gouvernance

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q35** | **Qui saisit** : le DT seul, ou aussi les chefs de chantier ? | droits d’écriture |
| **Q36** | **Qui valide** : le CdG seul, ou le DAF aussi au-delà d’un montant ? *(rappel : seuil BC ≤ 500 000 → DAF, > 500 000 → PDG)* | circuit d’approbation |
| **Q37** | **Seuil de bascule** : au-delà de combien une dépense doit-elle repasser par une **EB / BC** ? (0 = tout tracé en direct) | frontière dépense / achat |
| **Q38** | **Sans pièce justificative** : dépense refusée, ou tracée avec mention ? | règle de preuve |
| **Q39** | Contrôle **bloquant** (pas de paiement sans visa CdG) ou **a posteriori** (constat) ? | statut du visa |
| **Q40** | Qui doit **voir** ces dépenses : SA, DAF, PDG ? *(aujourd’hui ils ne les voient pas)* | périmètre de visibilité |

### Thème 7 — La cible dans TraceO

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q41** | Qu’est-ce qui vous **fait le plus mal** aujourd’hui : la ressaisie, l’absence de vision, les erreurs de total, les délais ? | priorité de lot |
| **Q42** | **Restitutions** attendues : par nature ? par chantier ? par bénéficiaire ? par mois ? **export comptable** ? | rapports + export |
| **Q43** | Voulez-vous **déposer le fichier Excel** (comme aujourd’hui) ou **saisir directement** dans TraceO — le fichier devenant l’exception ? | mode de saisie cible |
| **Q44** | À quelle **cadence** : mensuelle, hebdomadaire, à la demande ? | fréquence |
| **Q45** | Le contrôle doit-il se faire **dans TraceO** (valider / renvoyer au DT) ou hors outil ? | statut du bordereau |

### Thème 8 — Le fichier lui-même

| # | Question | Ce qu’on cherche |
|---|----------|------------------|
| **Q46** | Le journal **n’a aucune ligne d’en-tête** (les données commencent en **ligne 3**, et certaines colonnes sont vides ligne à ligne). Pouvez-vous **imposer au DT un modèle à en-tête figé**, ou TraceO doit-il accepter le format tel quel ? | modèle d’import (positionnel vs nommé) |
| **Q47** | Pouvez-vous fournir **2 fichiers supplémentaires** : le plus **récent**, et un **« sale »** (colonnes décalées, dates manquantes, doublons) ? | robustesse réelle de l’import |

### Thème 9 — Circuit de validation **hors SA** (main-d'œuvre, engins, frais) *(nouveau v1.1)*

> **Origine :** *« Les dépenses reliées à la main d'œuvre sont émises par le DT par l'entremise d'une EB tout comme celle des achats de matériaux. Le même circuit de validation est utilisé à l'exception du SA. »*
> Circuit observé : **DT → CdG → DAF → BT trésorerie → PDG (si ≥ 500 000 F) → déboursé → paiement Orange Money → facture**.

| # | Question | Ce qu'on cherche |
|---|----------|------------------|
| **Q48** | Une **EB main-d'œuvre** saute-t-elle **toujours** le SA, ou seulement au-delà / en-deçà d'un montant ? | règle de routage |
| **Q49** | **Qui** décide qu'une EB est « hors SA » : la **nature de charge** de la ligne (main d'œuvre / engins / frais) ou une **case** cochée par le DT ? | clé de routage (F02-A) |
| **Q50** | Le **CdG vise** l'EB hors SA — **avant** ou **après** le DAF ? Qui peut **rejeter**, et avec quel **motif obligatoire** ? | ordre des visas |
| **Q51** | Le seuil **PDG 500 000 F** s'applique-t-il au **montant de l'EB** hors SA, comme au **BC** ? | seuil de bascule |
| **Q52** | La **trésorerie** est-elle un **rôle** dans TraceO (comme DAF / CdG / SA), ou une **personne** qui reçoit un BT ? | nouveau rôle `treasury` ? |
| **Q53** | Le **déboursé** (paiement effectif) est-il **saisi** dans TraceO (date, montant, mode) ou seulement **constaté** ? | enregistrement du paiement |
| **Q54** | Le paiement se fait-il **toujours en Orange Money** ? Faut-il saisir le **n° de transaction** ? Y a-t-il des paiements **espèces / banque / chèque** ? | modes de paiement |
| **Q55** | Le **reçu / la facture** est-il **photographié** et **attaché à l'EB** ? Qui l'attache : le DT, la trésorerie ou le CdG ? | pièce jointe obligatoire |
| **Q56** | La **facture Orange Money** doit-elle être **imprimée** et classée physiquement, **en plus** de la pièce jointe dans TraceO ? | double archivage |
| **Q57** | Une EB main-d'œuvre **sans fournisseur** (cas `MIA`, `ABASS`, `MUR ET SOL`) : le **bénéficiaire** est-il l'**employé**, l'**équipe**, le **particulier** ou le **fournisseur** ? | référentiel bénéficiaires |
| **Q58** | Ces dépenses **consomment-elles l'enveloppe** F01 (budget affaire) ou le **déboursé sec** ? *(confirme Q31)* | imputation budgétaire |
| **Q59** | Faut-il **exclure** les EB hors SA de l'**engagé** (ce n'est pas une commande fournisseur) mais les **inclure** dans le **réalisé** ? | définitions F01 / F03 |
| **Q60** | Les **avances** (cf. Q19) créent-elles une **dette** à suivre jusqu'au solde, ou sont-elles des dépenses définitives ? | suivi avance / solde |

---

## 3. Annexes à remplir en séance

> **Les tableaux du §3 *sont* le référentiel dont l’import Excel a besoin** — les plus critiques : **3B** (37 n° de BC), **3C** (11 fournisseurs), **3D** (35 natures, *pré-classées en v1.1*). Une réunion = le mapping complet. Imprimez-les et faites-les remplir à la main.

### 3A — Sémantique des 10 colonnes (et ce qui est vraiment obligatoire)

> ✅ **RÉSOLU en v1.1 : le fichier reçu le 16/10/2026 porte une ligne d'en-tête.** Les colonnes sont donc **nommées**, plus déduites — l'import peut se fier aux intitulés. La question Q46 devient : *« ce modèle à en-tête est-il désormais le modèle **officiel imposé** au DT ? »*

| Col | **En-tête du fichier** | Contenu observé | Rempli | Distinct | Obligatoire ? |
|-----|------------------------|-----------------|-------:|---------:|---------------|
| **A** | **`Nom Chantier`** | `DG CI ENERGIE` (503) / `CI ENERGIE DG` (5) | 508/508 | 2 | **oui** — **2 graphies à normaliser** |
| **B** | **`Nom fournisseur`** | `UBH 2`, `UBH 1`, `MIA`, `UI`, `OUSMANE`, `EGEDY`, `SOGELUX`, `MAGMA`, `KONE MORY`, `MUR ET SOL`, `ABASS` | 185/508 | 11 | non (**64 % vides**) |
| **C** | **`Nature de dépense`** | 35 natures de charge | 508/508 | 35 | **oui** |
| **D** | **`No BC`** | `1144`, `726`, `967`… | 192/508 | 37 | non (**62 % vides**) |
| **E** | **`No Facture ou BL`** | `N°0314246N26000023982`, `4519`, `4015099` | 120/508 | 25 | non (**76 % vides**) |
| **F** | **`Date`** | dates — 69 jours distincts, 02/03 → 31/07/2026 | 508/508 | 69 | **oui** |
| **G** | **`Designation`** | libellé libre | 508/508 | 397 | **oui** |
| **H** | **`Qte`** | quantité | 191/508 | 27 | non (62 % vides) |
| **I** | **`PU`** | prix unitaire | 181/508 | 72 | non (64 % vides) |
| **J** | **`Montant`** | montant FCFA | 508/508 | 199 | **oui** |

**Conséquence produit : seuls `date`, `nature`, `libellé` et `montant` sont obligatoires.** Chantier, fournisseur, n° de BC, n° de pièce, quantité et PU sont **optionnels** — l’app doit accepter une ligne « nue » et la marquer **« à compléter »**.

**Autres faits mesurés :** 3 lignes à **montant négatif** (avoir / remise, `REMISE` −523 017 F) · **323 lignes sans fournisseur** (28 946 760 F, **41 % du journal**) · **316 lignes sans n° de BC** (58 988 050 F, **84 % des montants**).

### 3B — Les 37 n° de BC (`No BC`) → quel `purchase_orders.reference` dans TraceO ?

**✅ Cadrage tranché (16/10/2026) :** ces **37 n° de BC** sont des achats **déjà saisis dans TraceO**. Le travail n'est donc **pas** de les créer, mais de les **rapprocher** de `purchase_orders.reference` (colonne 5). Les lignes correspondantes **n'entrent pas** dans le réalisé — **I100 bloquant** (voir §6.4). *(à remplir en colonne 4 et 5)*

| N° BC | Lignes | Total FCFA | Chantier / site *(à remplir)* | `purchase_orders.reference` TraceO *(à remplir / « à créer »)* |
|------:|-------:|-----------:|-------------------------------|----------------------------------------------------------------|
| 726 | 11 | 369 000 | | |
| 727 | 3 | 110 000 | | |
| 738 | 6 | 61 500 | | |
| 739 | 2 | 114 000 | | |
| 753 | 3 | 184 000 | | |
| 754 | 1 | 85 000 | | |
| 790 | 5 | 313 000 | | |
| 802 | 2 | 195 000 | | |
| 824 | 5 | 177 000 | | |
| 836 | 1 | 110 000 | | |
| 849 | 5 | 170 700 | | |
| 850 | 2 | 84 000 | | |
| 943 | 2 | 195 000 | | |
| 959 | 4 | 13 381 | | |
| 960 | 5 | 118 000 | | |
| 964 | 3 | 13 581 | | |
| 967 | 10 | 524 000 | | |
| 968 | 6 | 30 459 | | |
| 991 | 5 | 697 157 | | |
| 994 | 1 | 220 000 | | |
| 1029 | 8 | 2 176 400 | | |
| 1043 | 10 | 637 000 | | |
| 1054 | 6 | 205 000 | | |
| 1074 | 8 | 735 000 | | |
| 1144 | 12 | 861 300 | | |
| 1160 | 11 | 404 016 | | |
| 1161 | 4 | 747 163 | | |
| 1162 | 4 | 49 500 | | |
| 1173 | 12 | 322 800 | | |
| 1175 | 3 | 155 500 | | |
| 1192 | 4 | 51 500 | | |
| 1241 | 12 | 696 474 | | |
| 1254 | 2 | 202 500 | | |
| 1264 | 2 | 180 000 | | |
| 1373 | 1 | 43 000 | | |
| 1392 | 7 | 142 600 | | |
| 1535 | 4 | 82 000 | | |
| **TOTAL** | **508** | **70 464 581** | | |

### 3C — Les 11 fournisseurs (`Nom fournisseur`) → type, métier, rattachement

⚠️ **5 de ces fournisseurs sont déjà des fournisseurs du catalogue BC de TraceO** (colonne 6) → risque de **double comptage** (piège n°2).

| Fournisseur | Lignes | Total FCFA | Type *(E = employé, Eq = équipe, F = fournisseur, P = particulier)* | Métier / rôle | Fournisseur TraceO existant ? |
|--------------|-------:|-----------:|------------------------------------------------------------------|---------------|-------------------------------|
| **UBH 2** | 68 | 3 635 500 | | | ⚠️ `UBH 02` (catalogue BC) |
| **UBH 1** | 44 | 2 061 400 | | | ⚠️ `UBH 01` (catalogue BC) |
| **MIA** | 22 | 1 501 741 | | | ? `MIA SEIGNEURIE` (catalogue BC) |
| **UI** | 12 | 696 474 | | | |
| **OUSMANE** | 11 | 329 500 | | | ⚠️ `OUSMANE` (catalogue BC) |
| **EGEDY** | 11 | 219 000 | | | ⚠️ `EGGEDY` (catalogue BC) |
| **SOGELUX** | 11 | 404 016 | | | ⚠️ `SOGELUX` (catalogue BC) |
| **MAGMA** | 3 | 24 922 190 | | | ? (marbre SANTA LUCIA) |
| **KONE MORY** | 1 | 85 000 | | | |
| **MUR ET SOL** | 1 | 130 000 | | | |
| **ABASS** | 1 | 7 533 000 | | | ? (menuiserie aluminium) |
| **TOTAL** | **185** | **41 517 821** | | | *(36 % des lignes, **59 % des montants**)* |

**À faire trancher :** les **323 lignes sans fournisseur** (28 946 760 F, **41 % du journal**) — est-ce normal, ou une saisie incomplète ?

> **Bonne nouvelle pour le référentiel :** le catalogue BC contient déjà des pseudo-fournisseurs de type particulier — `PARTICULIER`, `PARTICULIER CAROCOLE`, `PARTICULIER CIMENT`, `PARTICULIER SABLE & GRAVIER`, `PARTICULIER QUINCAILLERIE`… Le type **« particulier »** existe donc déjà dans les pratiques de saisie : le référentiel des bénéficiaires peut s’aligner dessus (employé / équipe / fournisseur / **particulier**).

### 3D — Les 35 natures de charge (grille de saisie du journal)

**Constat :** le rapport (Feuil2) **renomme 15 des 35 natures** (colonne 4). C’est un des arguments pour un référentiel avec *libellé + alias*.

**✅ Pré-classement déjà fait par le rapport (v1.1) — les 35 natures sont réparties en 2 blocs :**

| Bloc | Postes | Total rapport FCFA | Part |
|------|-------:|-------------------:|-----:|
| **Matériaux** | **19** | **60 755 281** | 86 % |
| **Main d’œuvre / frais** | **16** | **9 709 150** | 14 % |
| **TOTAL** | **35** | **70 464 431** | 100 % |

> **Conséquence :** la seule décision qui reste au CdG sur ce point est **la liste des familles** (2 ? 3 ? 4 ?) et **l'arbitrage des 3 postes ambigus** (`CONFECTION DE VOLET`, `POSE DE MARBRE/PLINTHES`, `DEPOSE DE GRANITE` — cf. Q25). Le classement lui-même est **déjà fait**.

**Bloc MATÉRIAUX (19 natures — 60 755 281 F)**

| Nature (journal) | Montant FCFA | Famille confirmée *(M / MO / F)* | Libellé du rapport (si renommé) | Rattachement TraceO *(à remplir)* |
|------------------|-------------:|----------------------------------|---------------------------------|-----------------------------------|
| MARBRE/PLINTHES | 26 070 110 | | MARBRES/PLINTHES | |
| MATERIELS DE CUISINE | 10 500 000 | | *(identique)* | |
| MENUISIRIE ALUMINUIN | 7 533 000 | | MENUISIERIE ALUMINIUM | |
| MATERIELS MENUISIERIE | 7 024 700 | | *(identique)* | |
| MATERIELS DE PEINTURE | 3 046 121 | | *(identique)* | |
| CAROCOL | 1 847 500 | | *(identique)* | |
| MATERIELS CHARPENTERIE | 1 046 474 | | MATERIELS DE CHARPENTERIE | |
| MATERIELS ELECTRICITE | 918 016 | | *(identique)* | |
| CIMENT | 743 300 | | *(identique)* | |
| MATERIELS MACONNERIE | 663 000 | | *(identique)* | |
| MATERIELS DE FERRAILLE | 387 100 | | MATERIELS FERRAILLE | |
| ASSECCOIRES MENUISIERIE | 325 000 | | *(identique)* | |
| SABLE | 210 000 | | *(identique)* | |
| MATERIELS DE PLOMBERIE | 191 800 | | MATERIELS PLOMBERIE | |
| EQUIPEMENT DE TRAVAIL | 119 500 | | *(identique)* | |
| MATERIELS ETANCHEITE | 65 000 | | *(identique)* | |
| PLATRE+MATERIELS DE PLATRE | 54 000 | | PLATRES+MATERIELS DE PLATRE | |
| MATERIELS DE NETOYAGE | 8 660 | | MATERIELS NETTOYAGE | |
| SAC VIDE | 2 000 | | *(identique)* | |
| **TOTAL MATÉRIAUX** | **60 755 281** | | *(**86 % des montants**)* | |

**Bloc MAIN D’ŒUVRE / FRAIS (16 natures — 9 709 300 F au journal, 9 709 150 F au rapport)**

| Nature (journal) | Montant FCFA | Famille confirmée *(M / MO / F)* | Libellé du rapport (si renommé) | Rattachement TraceO *(à remplir)* |
|------------------|-------------:|----------------------------------|---------------------------------|-----------------------------------|
| SALAIRES | 2 750 000 | | SALAIRES TECHNICIEN | |
| CONFECTION DE VOLET | 1 500 000 | | *(identique)* | |
| MAIN D’ŒUVRE MENUISIER | 1 221 374 | | *(identique)* | |
| MAIN D’ŒUVRE PONCEUR | 1 081 000 | | *(identique)* | |
| MAIN D’ŒUVRE CARRELEUR | 895 580 | | MAIN D’ŒUVRE CARRELAGE | |
| RAMASSAGE/DEMOLITION ET DECAPAGE | 515 390 | | *(identique)* | |
| POSE DE MARBRE/PLINTHES | 440 210 | | POSE MARBRE/PLINTH | ⚠️ **écart −90 F** |
| MANŒUVRE ET AIDES | 391 370 | | MAIN D’ŒUVRE ET AIDES | ⚠️ **écart −60 F** |
| MAIN D’ŒUVRE PEINTRE | 346 500 | | *(identique)* | |
| MAIN D’ŒUVRE FERRAILLE | 221 686 | | *(identique)* | |
| MAIN D’ŒUVRE ALUCONBOND | 150 760 | | MAIN D’ŒUVRE ALUCOBOND | |
| FRAIS DE CHARGEMENT/DECHARGEMENT | 74 885 | | *(identique)* | |
| DEPOSE DE GRANITE | 52 180 | | DEPOSE GRANITE | |
| MAIN D’ŒUVRE MACON | 49 250 | | *(identique)* | |
| MAIN D’ŒUVRE ETANCHEITE | 10 000 | | *(identique)* | |
| LIVRAISON DE MATERIELS | 9 115 | | LIVRAISON MATERIELS | |
| **TOTAL MAIN D’ŒUVRE / FRAIS** | **9 709 300** | | *(rapport : 9 709 150 — **14 % des montants**)* | |

**À faire trancher (Q25) :** `CONFECTION DE VOLET`, `POSE DE MARBRE/PLINTHES`, `DEPOSE DE GRANITE` — matériaux ou main d’œuvre ?

### 3E — Les libellés les plus fréquents (à catégoriser une fois pour toutes)

**397 libellés pour 508 lignes** (78 % uniques) → le libellé seul ne peut pas porter la catégorisation. Mais quelques libellés **très récurrents** méritent un rattachement automatique.

| Libellé | Occurrences | Total FCFA | Nature de charge probable *(à valider)* |
|---------|------------:|-----------:|-----------------------------------------|
| **FRAIS DE DEPOT** | **66** | 50 340 | ⚠️ **n’est pas une des 35 natures** — nature ou libellé ? |
| CARRELEURS | 5 | 104 000 | MAIN D’ŒUVRE CARRELEUR |
| TVA/MIA | 5 | 229 248 | ? (TVA incluse ?) |
| 02 AIDES 8000 | 4 | 32 000 | MANŒUVRE ET AIDES |
| SABLE | 3 | 210 000 | SABLE |
| AIDES | 3 | 80 000 | MANŒUVRE ET AIDES |
| CAROCOL | 3 | 495 000 | CAROCOL |
| REMISE | 3 | **−523 017** | ⚠️ montant négatif |
| DECOUPE | 3 | 118 000 | ? |
| PAIEMENT DE 02 AIDES | 3 | 24 000 | MANŒUVRE ET AIDES |
| 1 TONNE DE CIMENT | 2 | 180 000 | CIMENT |
| SACS CAROCOL KAKI | 2 | 330 000 | CAROCOL |
| SCOTCH LARGE | 2 | 20 000 | ? |
| DILUANT C 18L | 2 | 280 000 | MATERIELS DE PEINTURE |
| PANNEAUX 03C NORMAL | 2 | 1 356 000 | MATERIELS MENUISIERIE |
| 03 CARRELEURS 24000 | 2 | 48 000 | MAIN D’ŒUVRE CARRELEUR |
| TRANSPORT | 2 | 50 250 | FRAIS DE CHARGEMENT/DECHARGEMENT ? |

**Les plus gros montants unitaires (1 ligne = 1 libellé) :**

| Libellé | Total FCFA | Nature probable |
|---------|-----------:|-----------------|
| SANTA LUCIA 30*60 | 18 113 000 | MARBRE/PLINTHES |
| CUISINE | 10 500 000 | MATERIELS DE CUISINE |
| MENUISIERIE ALUMINIUM | 7 533 000 | MENUISIRIE ALUMINUIN |
| TVA/MAGMA | 3 801 690 | ? (TVA d’un fournisseur) |
| SANTA LUCIA | 3 007 500 | MARBRE/PLINTHES |
| SALAIRES | 2 750 000 | SALAIRES |
| AVANCE POUR TRAVAUX DE CONFECTION DE VOLET ELECTRIQUE — CONTRAT 2 090 000 | 1 500 000 | CONFECTION DE VOLET |
| CONTRE PLAQUE 18MM | 1 215 000 | MATERIELS MENUISIERIE |

### 3F — Le DQE AYALO (2ᵉ fichier) : budget de référence ou périmètre distinct ?

| Élément | Valeur observée | À valider |
|---------|-----------------|-----------|
| Feuille | `DQE ACT._AYALO` — **277 lignes** | |
| En-tête (ligne 11) | `N° DES PRIX` · `DESIGNATION DES OUVRAGES` · `U` · `QUANTITE` · `PRIX UNIT` · `MONTANT HT` | |
| Contexte | VILLE : AYALO (région de la Mé) · MINISTÈRE DE LA SANTÉ · *Travaux de construction d’une maternité* | chantier **public** |
| Structure | lots + ouvrages (`LOT 1 TERRASSEMENTS GENERAUX-VRD`, …) | |
| Feuille `Feuil1` (synthèse) | `PREVISIONS DQE` **80 029 985** · `DEPENSES REEL` **33 650 337** · `ECART` **46 379 648** | |

**Questions rattachées :** Q29 (qui calcule le « réel » ? est-ce un extrait du journal ?) · Q30 (même chantier que le journal ?) · Q32 (reproduire prévisions + écart dans TraceO ?) · Q33 (imputation au `N° DES PRIX` ?) · Q34 (contrôle du PU vs `PRIX UNIT` du marché ?).

**Enjeu :** si le « réel » du DQE est un **extrait du journal sous un code chantier**, alors AYALO doit être **identifiable parmi les 37 codes** — et le journal est la **source du réalisé** de tout le groupe.

### 3G — Contrôle des totaux (le cas de test)

| Contrôle | Valeur | Résultat |
|----------|-------:|----------|
| Σ lignes du **journal** (Feuil1, 508 lignes) | **70 464 581** | référence |
| Σ lignes du **rapport** (Feuil2, **35 postes**) | **70 464 431** | |
| **Écart** | **−150** | ⚠️ localisé sur **2 postes** |
| Bloc **matériaux** (19 postes) | 60 755 281 ↔ 60 755 281 | ✅ **identique au franc près** |
| Bloc **main d’œuvre / frais** (16 postes) | 9 709 300 → 9 709 150 | ⚠️ **l’écart est entièrement dans ce bloc** |
| Poste `POSE DE MARBRE/PLINTHES` | 440 210 → 440 120 | **−90** |
| Poste `MANŒUVRE ET AIDES` | 391 370 → 391 310 | **−60** |
| **Les 33 autres postes** | — | ✅ **identiques au franc près** |

**Vérification indépendante (16/10/2026) :** écart **reproduit à l'identique** sur le fichier v1 → ce n'est **pas** un artefact de lecture. Les deux écarts sont des **erreurs de saisie** (`370 → 310`, `210 → 120`), **pas** un problème de libellés ni d'arrondi systématique.

**À trancher :** si TraceO affiche « écart détecté : 150 F, postes concernés », vous voulez **blocage**, **alerte** ou **tolérance** ? *(cette réponse devient l’invariant I98)*

---

## 4. Checklist de sortie de réunion

> **✅ Séance du 16/10/2026 tenue.** La plupart des points ci-dessous sont **tranchés** :
> voir **§6.1** (réponses brutes), **§6.2** (décisions retenues) et **§6.3** (ce qui reste ouvert).
> Les cases restées vides sont celles qui ont besoin d'une **séance 2**.

- [ ] **§3A** — sémantique des 10 colonnes **confirmée** (en-têtes v1) + champs obligatoires validés
- [ ] **§3B** — les **37 n° de BC** → `purchase_orders.reference` (ou « à créer » / historique)
- [ ] **§3C** — les **11 fournisseurs** typés (employé / équipe / fournisseur / particulier) + rattachement catalogue
- [ ] **§3D** — les **35 natures** : familles validées (19 matériaux / 16 MO-frais) + 3 postes ambigus arbitrés
- [ ] **§3G** — règle sur l’écart : **blocage / alerte / tolérance**
- [ ] **Q37** — seuil de bascule vers une **EB / BC**
- [ ] **Q36** — qui valide : **CdG seul** ou **DAF** au-delà d’un montant
- [ ] **Q17 / Q12** — bordereau **multi-chantiers** ? **format unique** ?
- [ ] **Q46** — modèle d’import : en-tête **imposé** au DT ou format libre ?
- [ ] **Q47** — 2 fichiers obtenus : le plus **récent** + un **« sale »**
- [ ] **Q49** — clé de routage **hors SA** : nature de charge ou case cochée ?
- [ ] **Q50** — ordre des visas hors SA : **CdG avant ou après DAF** ?
- [ ] **Q51** — seuil **PDG 500 000 F** applicable à l’**EB** hors SA ?
- [ ] **Q52** — la **trésorerie** est-elle un **rôle** dans TraceO ?
- [ ] **Q54 / Q55** — paiement **Orange Money** + **facture jointe** à l’EB ?
- [x] **Q59** — hors SA : **exclu de l’engagé**, **inclus dans le réalisé** → ✅ tranché (§6)
- [ ] **Q51** — ⚠️ **à reposer** : seuil **PDG 500 000 F** applicable à l’**EB** hors SA ?
- [ ] **Q60** — ⚠️ **à reformuler** : les **avances** créent-elles une dette jusqu’au solde ?
- [ ] **Rapprochement journal ↔ BC** — valider le **taux de rapprochement** attendu (192 lignes / 37 BC) → **I106**

---

## 5. Ce que la réunion alimente dans le produit

| Réponse | Fonctionnalité | Devient dans TraceO |
|---------|---------------|---------------------|
| §3A | **T08** | le **schéma d’import** (10 colonnes nommées, 5 champs obligatoires seulement) |
| §3B | **T08** | la table de correspondance **`No BC → purchase_orders.reference`** |
| §3C | **F02-B** | le référentiel **bénéficiaires** + la **garde anti-double comptage** |
| §3D | **F02-A** | le référentiel **natures de charge** (35 postes → familles) |
| Q11 / Q44 | **T08** | la **périodicité** du bordereau (période début / fin) |
| Q36 / Q37 / Q39 | **F02-B** | le **workflow de visa** (statuts) et le **seuil EB** |
| Q48–Q56 | **F02-B** | le circuit **hors SA**, le rôle **trésorerie**, le **déboursé**, la **facture** |
| Q29 / Q32 / Q33 / Q34 | **F03** | le volet **budget vs réalisé** et l’imputation par ouvrage (DQE) |
| Q42 | **F02 / F03** | les **rapports** (nature / chantier / fournisseur / mois) + l’**export comptable** |
| §3G | **T08** | l’invariant **I98** — cohérence journal ↔ rapport |

**Invariants à écrire ensuite (la numérotation libre commence à I98) :**

| ID | Invariant proposé |
|----|-------------------|
| **I98** | **Cohérence du bordereau** : `computedTotal = Σ lignes`, et l’écart avec le total déclaré est affiché poste par poste |
| **I99** | **Idempotence du ré-import** : rejouer le même fichier ne crée **aucun doublon** |
| **I100** | **Non-recouvrement BLOQUANT** : une ligne de dépense directe dont le `No BC` correspond à un `purchase_orders.reference` existant n'est **jamais** recomptée (refus à l'import) ; une dépense **sans** BC entre dans le réalisé, jamais dans l'engagé (I70 intact) |
| **I106** | **Rapprochement journal ↔ BC** : le taux de rapprochement (lignes rapprochées ↔ lignes hors BC) est **calculé et affiché** avant tout import ; un écart non expliqué **bloque** |
| **I101** | **Cloisonnement** : le DT ne peut pas contrôler, le CdG ne peut pas créer, un autre tenant reçoit **404/403** |
| **I102** | **Routage par la nature** : une EB dont les lignes sont en famille **main d'œuvre / engins / frais** saute le SA **et** génère un BT trésorerie ; une EB **matériaux** suit le circuit SA/BC |
| **I103** | **Facture obligatoire avant déboursé** : aucun paiement hors SA n'est enregistré sans **pièce jointe** (reçu / facture Orange Money) attachée à l'EB |
| **I104** | **Nature obligatoire en saisie** : toute ligne d'EB saisie dans TraceO porte une nature du référentiel (liste fermée) |
| **I105** | **Famille unique** : une EB hors SA ne peut pas contenir de ligne de famille `materiaux` |

**Référence produit — découpage retenu :**

| Document | Contenu |
|----------|---------|
| [BTP-SPEC-F02-NATURES-CHARGE-DEPENSES-HORS-SA.md](./BTP-SPEC-F02-NATURES-CHARGE-DEPENSES-HORS-SA.md) | **F02** — lot A (natures de charge) + lot B (circuit hors SA) · invariants **I98, I100–I105** |
| *(à rédiger après la réunion CdG)* | **F03** — budget vs réalisé + référentiel **DQE** · **T08** — import Excel de l'historique (invariants **I98, I99**) |

---

## 6. Réponses du CdG — séance du 16 octobre 2026

> **Statut :** réponses **recueillies en séance** et reportées **telles quelles**.
> La correspondance avec la numérotation des questions de cet annexe est **à confirmer** sur les
> points marqués ⚠️ (§6.3) — voir l'observation de numérotation ci-dessous.

### 6.1 Réponses brutes (verbatim)

| # cité | Réponse du CdG |
|--------|----------------|
| **Q48** | oui |
| **Q49** | oui mais pour changer dans le futur |
| **Q50** | On utilisera le BT généré automatiquement suite à l'approbation du DAF et/ou PDG |
| **Q51** | Oui créer un nouveau rôle Trésorerie |
| **Q52** | Peu importe, il faut juste rattacher la facture du paiement à l'EB |
| **Q53** | Reçu OM ou autre reçu |
| **Q54** | Au déboursé et exiger de joindre la facture |
| **Q55** | il s'agit des mêmes, il n'y aura pas de risque de double (fichier humain, compilation de différentes sources) |
| **Q56** | Oui |
| **Q57** | Oui |
| **Q58** | Alerte, émise par le CdG |
| **Q59** | Comprends pas |

**⚠️ Observation de numérotation :** ces 12 réponses couvrent **12** des **13** questions Q48–Q60.
La correspondance directe échoue dès « *Oui créer un nouveau rôle Trésorerie* », qui répond
visiblement à **Q52** (*« La trésorerie est-elle un rôle dans TraceO ? »*) et **non** à Q51
(*« seuil PDG 500 000 F sur l'EB hors SA ? »*). L'hypothèse la plus probable est qu'**une
question n'a pas été répondue** — vraisemblablement **Q51**.

**Ne pas encoder Q51–Q59 dans le code sans confirmation** (voir §6.3).

### 6.2 Décisions retenues — **fiables quelle que soit la numérotation**

| Décision | Réponse | Impact produit |
|----------|---------|----------------|
| **Une EB main-d'œuvre saute toujours le SA** | « oui » | **I102** confirmé |
| **Le routage se fait par la nature de charge**, avec possibilité d'évolution | « oui mais pour changer dans le futur » | la famille route l'EB ; prévoir une **surcharge manuelle** en F02-B.2 |
| **Le BT est généré automatiquement APRÈS l'approbation DAF et/ou PDG** | « On utilisera le BT généré automatiquement suite à l'approbation du DAF et/ou PDG » | machine à états : `daf_review` / `pdg_review` → **`bt_pending`** → `bt_ready` (le BT n'est **pas** émis au moment du visa DAF) |
| **Un rôle « Trésorerie » est créé** | « Oui créer un nouveau rôle Trésorerie » | ajout de **`treasury`** à `procurementRoleEnum` (`schema.ts:29`) — Q52 tranché |
| **La facture du paiement est rattachée à l'EB** | « il faut juste rattacher la facture du paiement à l'EB » | le **rattachement** prime sur le débat « saisi ou constaté » (Q53) |
| **Paiement Orange Money ; reçu OM ou autre reçu** | « Reçu OM ou autre reçu » | `disbursement_method` + **pièce libre** (reçu OM, autre reçu) — Q54 |
| **La facture est exigée au moment du déboursé** | « Au déboursé et exiger de joindre la facture » | **I103 confirmé** — Q55 |
| **Un seul document : pas d'impression séparée à archiver** | « il s'agit des mêmes, il n'y aura pas de risque de double » | la pièce jointe **est** le justificatif → pas de double archivage — Q56 tranché |
| **Un dépassement d'enveloppe déclenche une ALERTE émise par le CdG** | « Alerte, émise par le CdG » | confirme **D-F01-3** (warning, jamais blocage) — Q58 |
| **⚠️ « il s'agit des mêmes » = LES MÊMES DÉPENSES** *(lecture B confirmée)* | « il s'agit des mêmes, il n'y aura pas de risque de double (fichier humain, compilation de différentes sources) » | Les **192 lignes / 11 476 531 F** qui portent un n° de BC **sont déjà** les achats saisis en BC dans TraceO → **I100 devient BLOQUANT**. Voir §6.4 |
| **Le seuil PDG 500 000 F s'applique à l'EB hors SA** | « oui appliquer la même limite de 500k » *(confirmé après séance)* | **même constante** que le BC (`DEFAULT_BT_THRESHOLD_FCFA`, `server/config/procurement.ts:11`) : **> 500 000 F → visa PDG** ; **≤ 500 000 F → DAF seul** |

### 6.3 ⚠️ À confirmer avant d'encoder

| Question de l'annexe | Réponse reçue *(hypothèse)* | Pourquoi ce n'est pas tranché |
|----------------------|-----------------------------|-------------------------------|
| **Q51** — seuil **PDG 500 000 F** sur l'**EB** hors SA ? | ✅ **tranché** *(hors séance)* | **oui, même limite de 500 000 F** → voir §6.2 |
| **Q57** — type de bénéficiaire (employé / équipe / particulier / fournisseur) ? | « Oui » | la question est un **choix**, pas un oui/non |
| **Q58** — consomment-elles l'**enveloppe F01** ou le **déboursé sec** ? | « Oui » | la question est un **choix**, pas un oui/non |
| **Q59** — exclu de l'**engagé**, inclus dans le **réalisé** ? | « Alerte, émise par le CdG » | ne répond pas à la question posée |
| **Q60** — les **avances** créent-elles une dette jusqu'au solde ? | « Comprends pas » | question **à reformuler** en séance 2 |

#### ✅ Trancher « *il s'agit des mêmes* » = **les mêmes dépenses** (lecture B — confirmé)

Le journal est un **fichier humain, compilation de différentes sources**. Les **192 lignes /
11 476 531 F** qui portent un n° de BC **sont** les achats **déjà saisis en BC dans TraceO** —
ce ne sont **pas** des dépenses distinctes.

**Conséquences encodées dans la spec F02 :**

| # | Règle |
|---|-------|
| 1 | **I100 devient BLOQUANT** : une ligne dont le `No BC` correspond à un `purchase_orders.reference` existant **n'est jamais recomptée** — refus à l'import, pas une simple alerte. |
| 2 | Le **réalisé** d'un chantier = BC livrés **+** lignes **sans** BC rapproché. Les 192 lignes rapprochées **n'ajoutent rien**. |
| 3 | L'**import (T08)** doit **rapprocher avant d'importer** : les lignes rapprochées sont **exclues du réalisé**, pas créées comme dépenses. |
| 4 | Le rapprochement devient un **contrôle à valeur** : TraceO confronte le journal à **ses propres BC** et affiche le taux de rapprochement (**I106**). |
| 5 | **§3B change de nature** : les 37 n° de BC ne sont plus « à créer » mais **à rapprocher** de `purchase_orders.reference` **existants**. |
| 6 | **Conséquence chiffrée** : sur les 70 464 581 F du journal, **58 988 050 F (84 %)** sont du réel **non encore capté** par TraceO — c'est exactement le périmètre de T08. |

> **Ce que ça évite :** compter **deux fois** 11 476 531 F, soit un réalisé de chantier
> **surévalué de 16 %** — et un écart F03 qui deviendrait un faux signal d'alerte.

### 6.5 Nature du fichier — clarification du CdG

> **Précision apportée par le CdG :** *« le fichier CI ENERGIE est créé par le CdG ; il a compilé
> des données déjà existantes afin de faire un suivi des dépenses sur un chantier en particulier. »*

**Ce que cela établit :**

| Constat | Conséquence |
|---------|-------------|
| Le fichier est **fabriqué par le CdG** | Ce n'est **pas** un document opérationnel d'origine (BC, reçu, facture) — c'est une **recompilation** |
| Il **compile des données déjà existantes** | Les sources premières sont ailleurs (BC dans TraceO, reçus OM, factures) → **aucune ligne n'est nouvelle en soi** |
| Son but : **suivi des dépenses d'un chantier** | C'est un **besoin de pilotage**, pas un besoin de saisie → **TraceO doit produire ce suivi lui-même** |
| Il porte **un seul chantier** | Explique la colonne A (2 graphies d'un même nom) et l'absence de code d'affaire — voir §3B |

**Trois conséquences pour le projet :**

1. **Le fichier est la spécification de la SORTIE, pas une source à importer.**
   C'est un **« golden file »** : les 10 colonnes (§3A), les 35 natures **pré-classées** (§3D) et
   les 2 blocs (matériaux / main d'œuvre-frais) sont **exactement ce que TraceO doit restituer**.
2. **T08 change de nature.** Il ne s'agit plus d'« importer l'historique », mais de **rejouer le
   passé** — et **uniquement** les lignes que TraceO ne connaît pas déjà, c'est-à-dire les
   **315 lignes sans BC (58 988 050 F)**. Les **192 lignes rapprochées sont exclues** (I100 bloquant).
3. **La vraie livraison pour le CdG est F03** (budget vs réalisé par chantier) : c'est elle qui
   **remplace le fichier manuel**. F02-B la **nourrit** en données réelles ; T08 ne sert qu'à
   **amorcer** l'historique des 5 mois passés.

> **Ce que cela interdit :** traiter le fichier comme une **source de vérité** et créer 508 lignes
> de dépenses dans TraceO. On importerait une **copie de copie** — avec 192 doublons à la clé.






