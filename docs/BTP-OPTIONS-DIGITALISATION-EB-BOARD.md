# Options de digitalisation de l’EB — Document de décision board

**TraceO BTP — Expression de besoin chantier**

| | |
|---|---|
| **Version** | 1.2 — août 2026 (+ option A8 WhatsForm lien) |
| **Public** | Board des gestionnaires, DT, DAF, SA, direction |
| **Statut** | Document de décision — fourchettes FCFA à valider |
| **Périmètre** | Digitalisation de la **production de l’EB** (entrée du circuit achats) |
| **Hors périmètre comparatif** | BC → validation DAF/PDG → livraison → stock · **F08 / F10** (ERP / marchés ST) — voir [BTP-INDEX.md](./BTP-INDEX.md) |

---

## Table des matières

1. [Résumé exécutif](#resume-executif)
2. [Contexte et enjeu](#1-contexte-et-enjeu)
3. [Hypothèses de coûts](#2-hypotheses-de-couts)
4. [Options A1–A8](#3-option-a1--formulaires-whatsapp-natifs-meta-flows)
5. [Matrice comparative](#11-matrice-comparative)
6. [Recommandation](#12-recommandation)
7. [Décisions board](#13-decisions-board)
8. [Annexes](#14-annexes)

---

## Résumé exécutif

Le board doit choisir **comment** l’expression de besoin (EB) devient un document SA numérique fiable — pas quelle technologie de parsing utiliser.

**But mesurable :** fiche EB structurée (équivalent fiche besoin achat SA), **sans ressaisie Excel par le DT**, original archivé, validation DT explicite. KPI pilote : **≥ 70 %** des EB standard sans ressaisie DT.

**Situation actuelle (baseline, non votable) :** WhatsApp terrain → DT ressaisit Excel → circuit papier. Coût caché estimé **800 000 – 2 000 000 FCFA/mois** (1–2 h/jour DT × coût chargé interne).

**Huit options comparées : A1 à A8.**

| Option | Intitulé | Setup (FCFA) | Récurrent/mois | Délai |
|--------|----------|--------------|----------------|-------|
| **A1** | Formulaires WhatsApp natifs (Meta Flows) | 5 – 10 M | 150 – 400 k | 10 – 14 sem. |
| **A2** | Copilote DT — zéro friction terrain | 3 – 6 M | 50 – 200 k | 6 – 8 sem. |
| **A3** | Excel vivant synchronisé | 4 – 7 M | 30 – 100 k | 8 – 12 sem. |
| **A4** | EB inversée (reliquats + stock) | 8 – 14 M | 100 – 300 k | 12 – 18 sem. |
| **A5** | Catalogue fournisseur + panier chantier | 6 – 12 M | 80 – 250 k | 10 – 14 sem. |
| **A6** | Canal vocal dédié (voice-first BTP) | 5 – 9 M | 120 – 450 k | 8 – 12 sem. |
| **A7** | Bot membre du groupe WhatsApp | 8 – 14 M | 200 – 600 k | 10 – 16 sem. |
| **A8** | Formulaire lien (WhatsForm / équivalent) | 1 – 3 M | 30 – 120 k | 2 – 4 sem. |

**Recommandation pilote J0–J90 : combinaison A2 + A5**, avec gate **A6** à J+60 (vocaux), réévaluation **A7** à **J+90**, et **A8** réservé au **POC accéléré** si besoin données propres avant catalogue TraceO (voir §12).

---

## 1. Contexte et enjeu

### 1.1 Douleur actuelle

| Acteur | Aujourd’hui | Conséquence |
|--------|-------------|-------------|
| **Technicien** | Message WhatsApp libre dans le groupe chantier | Pas de statut ; message noyé |
| **DT** | **Ressaisie** fiche EB Excel | Double saisie, erreurs qté, retard |
| **SA** | Reçoit EB Excel, émet BC | Pas de lien numérique amont |
| **Direction** | Vision partielle | Pas de dossier EB traçable |

### 1.2 Point de départ TraceO

Le prototype couvre déjà ~**30–40 %** du chemin EB :

- Webhook WhatsApp (simulation dev + squelette Meta)
- Parser texte (règles + OpenAI optionnel)
- Boîte EB manager + révision DT

**Gaps pour « EB production » :** export fiche SA (PDF/Excel), WhatsApp Meta production, voix/photo, dossier EB complet (original + export).

### 1.3 Question board

> **Qui change d’habitude ?** (terrain, DT, SA)  
> **D’où naît l’EB ?** (message, formulaire, reliquat, catalogue, suggestion système)

Les **huit options** ci-dessous répondent à des **modèles différents**, pas à des degrés de la même solution.

### 1.4 Capture WhatsApp — quatre modes (repère)

| Mode | Description | Option doc |
|------|-------------|------------|
| **Pont** | Technicien transfère/répond au n° TraceO | Combinable avec A2, A5 |
| **Formulaire lien** | Lien / QR → page mobile (WhatsForm, etc.) → webhook TraceO | **A8** |
| **Bot membre du groupe** | Numéro TraceO **dans le groupe** ; lit et répond | **A7** |
| **Flow natif in-chat** | Formulaire Meta **dans** WhatsApp | **A1** |
| **Lecture passive totale** | Silencieux, 100 % du fil | **Non retenu** — API Meta non garantie |

Voir [BTP-WHATSAPP-DOSSIER-CHANTIER.md](./BTP-WHATSAPP-DOSSIER-CHANTIER.md) §7.2.

---

## 2. Hypothèses de coûts

| Hypothèse | Valeur |
|-----------|--------|
| Pilote | 1 chantier, 5–15 techniciens, **2–5 EB/jour** |
| Dev interne / consultant CI | **75 000 – 150 000 FCFA / jour** |
| Prototype TraceO existant | Réduit le setup des options A2, A5, A6 |
| Meta WhatsApp Cloud API | **80 000 – 350 000 FCFA/mois** (pilote) |
| IA OpenAI (texte / STT) | **15 000 – 400 000 FCFA/mois** selon option |
| Conversion | **1 USD ≈ 600 FCFA** |
| Gate vocal J+60 | **A6** si > 40 % vocaux |
| Gate bot groupe J+90 | **A7** si pont < 50 % ou besoin journal complet |
| POC formulaire lien | **A8** si besoin données propres **< 4 sem.** (transitoire) |

Les montants sont des **fourchettes d’ordre de grandeur** pour arbitrage — pas des devis fermes.

---

## 3. Option A1 — Formulaires WhatsApp natifs (Meta Flows)

### Résumé

Remplacer le parsing de messages libres par un **formulaire structuré in-chat** (Meta WhatsApp Flows). Le technicien remplit chantier, produit, qté, unité **dans WhatsApp** — zéro ambiguïté, zéro IA pour structurer.

### Question stratégique

*Comment obtenir des données propres à la source sans deviner le contenu d’un message libre ?*

### Flux

```
Technicien → ouvre Flow WA → saisie structurée → brouillon EB TraceO
    → DT valide → export fiche SA
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Formulaire Meta in-chat | Parsing messages libres |
| Intégration TraceO | Voix / photo |
| Export fiche SA | Catalogue produits (voir A5) |
| Validation DT | Circuit BC aval (hors doc) |

### Prérequis

- Compte **Meta Business** vérifié
- Templates Flows **approuvés Meta** (délai variable en CI)
- Référent interne Meta
- Formation techniciens : « Remplir le besoin » (1 geste)

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **5 – 10 M FCFA** |
| **Récurrent / mois** | **150 – 400 k FCFA** |
| Dont Meta | 150 – 400 k |
| Dont IA | 0 |

**Délai pilote : 10 – 14 semaines** (validation templates = goulot).

### Avantages

1. **Données propres à la source** — pas d’hallucination IA
2. Audit trail natif Meta + TraceO
3. WhatsApp conservé comme canal
4. Ressaisie DT cible **< 10 %**
5. Scalable multi-chantiers (templates par site)
6. Conformité : DT valide toujours

### Inconvénients

1. Dépend **approbation Meta Flows** en Côte d’Ivoire
2. Moins flexible pour besoins atypiques / hors catalogue
3. Nouveau geste à former (même léger)
4. Délai validation templates imprévisible
5. Coût Meta récurrent non nul
6. Hors-catalogue = voie de secours à prévoir (A2)

### Risques et parades

| Risque | Parade |
|--------|--------|
| Flows non disponibles / retard Meta | Voie secours A2 en parallèle |
| Technicien contourne le Flow | Message libre → copilote DT |
| Template rigide | Champs optionnels + commentaire |

### KPI succès

- **≥ 90 %** EB via Flow sans correction DT sur qté/unité
- Délai message → EB validée **< 2 h ouvrées**

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Priorité **fiabilité données** > flexibilité message libre | Meta Flows bloqué > 3 mois |
| Board accepte délai onboarding Meta | Besoins 100 % atypiques / hors formulaire |

---

## 4. Option A2 — Copilote DT « zéro friction terrain »

### Résumé

**Aucun changement** pour le technicien (groupe WhatsApp inchangé). Le DT ouvre TraceO, **importe ou forwards** les messages du jour ; l’IA structure un brouillon ; le DT valide. L’EB naît **côté bureau**.

### Question stratégique

*Comment digitaliser sans imposer un nouveau geste aux techniciens ?*

### Flux

```
Groupe WA (inchangé) → DT importe/forwards → IA batch → brouillon EB
    → DT valide → export fiche SA
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| UI copilote DT | Pont WA obligatoire terrain |
| Batch IA structuration | Formulaire technicien |
| Boîte EB + révision (existant) | Accusés statut au technicien (phase 2) |
| Export fiche SA | Catalogue (combiner A5) |

### Prérequis

- DT disponible et **discipliné** (revue quotidienne)
- Clé API OpenAI (ou équivalent)
- Export gabarit fiche SA

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **3 – 6 M FCFA** |
| **Récurrent / mois** | **50 – 200 k FCFA** |
| Dont Meta | 0 – 80 k (optionnel) |
| Dont IA | 30 – 150 k |

**Délai pilote : 6 – 8 semaines**

### Avantages

1. **Zéro résistance techniciens** — argument massue adoption
2. Capitalise prototype Boîte EB (~40 % fait)
3. Coût Meta faible ou nul
4. Temps DT par EB **÷ 2 à 3** vs Excel
5. **≥ 80 %** EB sans frappe manuelle des lignes
6. Combine naturellement avec **A5** (catalogue + exceptions)

### Inconvénients

1. Charge DT **partiellement maintenue** (revue, pas ressaisie)
2. Pas de statut temps réel pour le technicien
3. Dépend discipline DT
4. Batch ≠ temps réel
5. IA : risque erreur qté → validation DT obligatoire
6. Ne réduit pas le **volume** de messages WA

### Risques et parades

| Risque | Parade |
|--------|--------|
| DT saturé, copilote ignoré | Priorisation EB urgentes ; alertes |
| Erreurs IA | Original message visible ; DT responsable |
| Double travail WA + TraceO | Import en 1 clic depuis forwards |

### KPI succès

- Temps DT / EB **÷ 2 minimum**
- **≥ 80 %** lignes EB sans saisie manuelle

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Priorité absolue = **ne pas toucher au terrain** | DT déjà saturé sans marge de revue |
| Combiner avec **A5** pour le pilote | Besoin statut technicien immédiat |

---

## 5. Option A3 — Excel vivant synchronisé

### Résumé

La **fiche EB Excel reste l’interface** DT/SA. TraceO **synchronise** en arrière-plan (connecteur Sheets / import planifié). Le dossier numérique se remplit sans changer l’écran métier.

### Question stratégique

*Comment tracer sans retirer Excel à DT et SA ?*

### Flux

```
DT saisit Excel (habitude) → sync TraceO → dossier numérique
    → circuit BC / livraison aval
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Connecteur sync colonnes fiche SA | Suppression ressaisie |
| Dossier TraceO | Capture WhatsApp auto |
| Mapping conflits | IA parsing |

### Prérequis

- Accord SA sur mapping colonnes Excel ↔ TraceO
- Hébergement fichier (SharePoint, Google Sheets, ou import CSV planifié)
- Règles de résolution conflits

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **4 – 7 M FCFA** |
| **Récurrent / mois** | **30 – 100 k FCFA** |
| Dont Meta | 0 |
| Dont IA | 0 |

**Délai pilote : 8 – 12 semaines**

### Avantages

1. **Adoption SA/DT maximale** — écran familier
2. Continuité compta et audits Excel
3. Risque technique **faible**
4. Coût récurrent **minimal**
5. Lien BC/livraison TraceO possible en aval
6. Board conservateur rassuré

### Inconvénients

1. **Ne supprime pas** la saisie — synchronise seulement
2. Double vérité si conflits sync
3. Perception « pas une vraie transformation »
4. Pas de lien message WhatsApp terrain
5. Maintenance connecteur à chaque changement Excel
6. Gain DT **< 30 %** typiquement

### Risques et parades

| Risque | Parade |
|--------|--------|
| Versions Excel divergentes | Fichier unique référence ; verrouillage |
| SA modifie hors sync | Import planifié + log écarts |

### KPI succès

- **100 %** EB au format SA dans TraceO
- Gain temps DT **≥ 20 %** (realistic)

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Board **craint le changement** | Objectif = **éliminer** ressaisie (douleur n°1) |
| SA exige Excel identique à court terme | Vision WhatsApp-first long terme |

---

## 6. Option A4 — EB inversée (reliquats + stock)

### Résumé

**Inverser le flux** : la majorité des EB ne partent plus d’un message technicien mais du **système** — livraison partielle → EB complément ; stock sous seuil → EB suggérée ; bilan soir → anticipation. WhatsApp = **exceptions et urgences** seulement.

### Question stratégique

*Comment réduire le volume d’EB réactives et anticiper les ruptures ?*

### Flux

```
Livraison partielle / stock sous seuil → TraceO suggère EB
    → DT valide → export fiche SA
WhatsApp (urgences seulement) ──────────────┘
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Règles reliquat → EB complément | Saisie WA standard |
| Seuils stock DT → EB suggérée | Catalogue (A5) |
| Validation DT sur suggestions | Déploiement sans livraisons TraceO |

### Prérequis

- **Livraisons tracées** dans TraceO (preuve, qtés)
- Stock S0–S1 (entrée à livraison, seuils DT)
- Calibrage 3–5 produits pilote

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **8 – 14 M FCFA** |
| **Récurrent / mois** | **100 – 300 k FCFA** |
| Dont Meta | 50 – 150 k |
| Dont IA | 20 – 80 k |

**Délai pilote : 12 – 18 semaines**

### Avantages

1. **Transformant** — change le métier, pas seulement l’outil
2. **−30 à 50 %** volume EB réactives WhatsApp
3. Anticipation ruptures (aligné vision Phase 4 synthèse exécutive)
4. Moins de bruit groupe WhatsApp
5. DT valide, ne crée plus tout from scratch
6. ROI long terme élevé

### Inconvénients

1. **Prérequis livraisons fiables** — sinon suggestions fausses
2. Délai le plus long
3. Calibrage seuils = effort DT initial
4. Ne remplace pas saisie EB **ponctuelle** (combiner A2/A5)
5. Investissement stock + livraison en parallèle
6. Complexité organisationnelle

### Risques et parades

| Risque | Parade |
|--------|--------|
| Données livraison incomplètes | Phase 1b livraisons avant A4 |
| Seuils mal calibrés | Relevé « il reste X » hebdo DT |
| Suggestions ignorées | Alertes WA + dashboard |

### KPI succès

- **≥ 40 %** EB générées par suggestion système
- Ruptures non anticipées pilote **< 2** / trimestre

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Board vise **anticipation**, pas seulement saisie | Livraisons encore hors TraceO |
| Phase 2 après pilote livraisons | Besoin gain immédiat sur ressaisie (< 3 mois) |

---

## 7. Option A5 — Catalogue fournisseur + panier chantier

### Résumé

L’EB devient un **panier** issu d’un **catalogue** (interne ou fournisseur) : QR ou lien chantier → produits normalisés (ciment, fer, sable…), unités et libellés **sans ambiguïté**.

### Question stratégique

*Comment éliminer les erreurs libellé / unité à la racine ?*

### Flux

```
Technicien ou DT → QR chantier → catalogue 3–5 produits
    → panier EB → DT valide → export fiche SA
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Catalogue pilote 3–5 SKU | Tous produits BTP |
| UI panier (mobile web ou WA link) | Parsing message libre |
| Lien fournisseur | Onboarding multi-fournisseurs massif |
| Export fiche SA | BC aval (hors doc) |

### Prérequis

- SA référence produits + fournisseurs pilote
- 3–5 produits stables identifiés (cas chantier pilote)
- Voie secours hors catalogue (→ **A2**)

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **6 – 12 M FCFA** |
| **Récurrent / mois** | **80 – 250 k FCFA** |
| Dont Meta | 50 – 150 k |
| Dont IA | 0 – 50 k |

**Délai pilote : 10 – 14 semaines**

### Avantages

1. **Zéro erreur libellé/unité** sur catalogue
2. Préparation BC SA directe (montants, refs)
3. Scalable multi-chantiers
4. Réduit parsing hasardeux à **near zero** sur 80 % besoins
5. Aligné pilote 3–5 produits documenté
6. Combine idéalement avec **A2** (exceptions)

### Inconvénients

1. Onboarding **catalogue** (SA + données)
2. Produits hors catalogue = process parallèle requis
3. Investissement référentiel produits
4. Technicien : nouveau geste (QR / lien)
5. Fournisseurs non référencés = friction
6. Setup moyen-élevé

### Risques et parades

| Risque | Parade |
|--------|--------|
| Produit absent du catalogue | Voie A2 copilote DT |
| Catalogue obsolète | SA owner référentiel ; revue mensuelle |
| Faible usage QR | DT saisit panier depuis bureau |

### KPI succès

- **≥ 80 %** EB pilote via catalogue
- **0** erreur unité sur EB catalogue (audit SA)

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Chantier = **3–5 produits récurrents** | Achats très hétérogènes sans référentiel |
| Combiner avec **A2** pour exceptions | Refus investir données produits |

---

## 8. Option A6 — Canal vocal dédié (voice-first BTP)

### Résumé

Numéro WhatsApp **« TraceO Vocal »** : le technicien envoie **uniquement des notes vocales**. Pipeline STT optimisé **français ivoirien + vocabulaire BTP**. Texte = admin ; voix = terrain.

### Question stratégique

*Comment coller à l’usage vocal dominant sur les chantiers CI ?*

### Flux

```
Technicien → note vocale WA dédiée → STT BTP → lignes EB
    → DT valide (écoute si besoin) → export fiche SA
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Canal WA vocal dédié | OCR photo (option phase 2) |
| STT + glossaire BTP | Parsing texte libre générique |
| UI relecture audio DT | Flows Meta (A1) |
| Export fiche SA | Multimodal fourre-tout |

### Prérequis

- Budget STT récurrent validé
- Glossaire produits BTP pilote
- Consentement traitement vocaux
- Meta Cloud API (médias)

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **5 – 9 M FCFA** |
| **Récurrent / mois** | **120 – 450 k FCFA** |
| Dont Meta | 80 – 200 k |
| Dont IA (STT) | 80 – 300 k |

**Délai pilote : 8 – 12 semaines**

### Avantages

1. **Mains libres** — naturel sur chantier
2. Colle à usage réel CI (vocal > texte)
3. Canal **optimisé** vs multimodal générique
4. Réduit illettrisme / flemme texte
5. **≥ 85 %** EB sans ressaisie si STT calibré
6. Complète A5 (catalogue) ou A2 (exceptions vocales)

### Inconvénients

1. Coût STT récurrent
2. Bruit chantier → qualité variable
3. DT doit écouter si confiance basse
4. Latence traitement (30 s – 2 min)
5. Deux numéros WA à communiquer (vocal vs admin)
6. Pas adapté si terrain déjà texte structuré

### Risques et parades

| Risque | Parade |
|--------|--------|
| STT erreur qté | DT validation + replay audio |
| Surcoût volume | Plafond messages ; durée max vocal |
| Bruit | Guide « vocal court, répéter qté » |

### KPI succès

- **≥ 85 %** EB sans correction ligne DT
- **≥ 80 %** vocaux traités sans ressaisie manuelle

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Retex **> 50 % vocaux** | Techniciens texte structuré OK |
| Gate J+60 après A2+A5 insuffisant | Budget STT non validé |

---

## 9. Option A7 — Bot membre du groupe WhatsApp

### Résumé

Ajouter le **numéro TraceO comme membre** du groupe chantier : le bot **lit** les messages (texte, vocal, photo), **classifie** les EB, **accuse réception** et **poste les statuts** dans le fil — **sans** transfert manuel au numéro TraceO.

### Question stratégique

*Comment capturer 100 % du fil groupe sans changer le geste « j’écris dans le groupe » ?*

### Flux

```
Technicien → message dans le groupe (habitude inchangée)
    → Bot TraceO (membre) ingère + classe EB
    → Accusé + statut dans le groupe (« EB reçue — en revue DT »)
    → DT valide dans TraceO → export fiche SA
```

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Bot ajouté au groupe pilote | Lecture passive silencieuse sans bot (non garanti Meta) |
| Classification EB + journal horodaté | Remplacement complet pont A2 (phase 1) |
| Accusés / statuts BC dans le groupe | Décision finance BC (hors doc) |
| Archivage original message | OCR industriel multi-documents |

### Prérequis

- Compte Meta Business vérifié + **capacités groupe** confirmées par BSP ou Coexistence
- Charte groupe : rôle du bot, mentions @TraceO pour hors-EB
- Filtres bruit (salutations, photos sans légende, messages admin)
- DT + SA formés au journal TraceO (pas seulement au fil WA)

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **8 – 14 M FCFA** |
| **Récurrent / mois** | **200 – 600 k FCFA** |
| Dont Meta / BSP | 100 – 350 k |
| Dont IA (classification + STT) | 80 – 250 k |

**Délai pilote : 10 – 16 semaines** (dépend conformité Meta groupe)

### Avantages

1. **Zéro friction** — technicien ne change pas d’habitude
2. **Journal complet** du chantier si ingestion fiable
3. **Transparence** — accusés visibles par toute l’équipe
4. Réduit oublis de transfert au pont
5. Base pour dossier chantier / audit (fil structuré)
6. Complète A2/A5 si adoption pont < 50 %

### Inconvénients

1. **API Meta ne garantit pas** la lecture intégrale du groupe (voir dossier WhatsApp §7.2)
2. Setup **plus lourd** que pont (BSP, droits bot, tests Meta)
3. **Bruit** du fil → coût IA + risque faux positifs EB
4. Politique Meta **évolutive** (capacités groupe)
5. Gouvernance : qui mute le bot ? messages hors périmètre
6. Coût récurrent **supérieur** à A2 seul

### Risques et parades

| Risque | Parade |
|--------|--------|
| Meta retire / limite bots groupe | **Pont A2** reste mode officiel ; A7 = option J+90 |
| Sur-classification (spam EB) | Seuils confiance ; DT rejette ; apprentissage chantier |
| Messages sensibles dans le groupe | Charte + rappel DM pour RH / paie |
| Latence accusés | SLA affiché ; file d’attente visible DT |

### KPI succès

- **≥ 90 %** des EB terrain captées **sans** transfert manuel
- **≤ 10 %** messages classés EB à tort (audit DT hebdo)
- **≥ 70 %** techniciens satisfaits (pas de surcharge notifications)

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Pont < **50 %** adoption à J+90 | Pilote J0–J90 (prioriser A2+A5) |
| Besoin **journal chantier** complet | Budget Meta/BSP non validé |
| Meta/BSP confirme capacités groupe | DT préfère contrôle pont explicite |

**Alternatives documentées :** Coexistence / BSP étendu, export manuel fil, pont transfert — [BTP-WHATSAPP-DOSSIER-CHANTIER.md](./BTP-WHATSAPP-DOSSIER-CHANTIER.md) §7.2.

---

## 10. Option A8 — Formulaire lien (WhatsForm / équivalent)

### Résumé

Formulaire **mobile web** (ex. [WhatsForm](https://whatsform.com)) partagé par **lien épinglé** ou **QR** dans le groupe chantier. Le technicien remplit chantier, produit, qté, unité ; à la soumission, les données arrivent par **message WhatsApp** sur le numéro TraceO **et/ou** **webhook JSON** vers TraceO — **sans** Meta Flows ni développement catalogue complet.

### Question stratégique

*Comment obtenir des EB propres en quelques jours, en attendant A5 ou si Meta Flows (A1) bloque ?*

### Flux

```
Technicien → lien WhatsForm (épinglé groupe / QR container)
    → saisie structurée 5–7 champs → Submit
    → webhook TraceO + récap WA → brouillon EB
    → DT valide → export fiche SA
```

Maquette pilote prête à coller : [BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md](./BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md).

### Périmètre

| Inclus | Exclus |
|--------|--------|
| Builder no-code (WhatsForm ou similaire) | Formulaire **natif in-chat** Meta (→ A1) |
| Webhook POST → TraceO | Catalogue TraceO intégré (→ A5) |
| 5 produits pilote en liste déroulante | Voix / photo dans le formulaire |
| Récap message WA + audit | Remplacement long terme du pont A2 |

### Prérequis

- Compte WhatsForm (ou équivalent) + numéro WA TraceO
- Endpoint webhook TraceO (ou file d’attente manuelle POC)
- Lien épinglé + charte groupe (30 s formation)
- SA valide libellés produits Q3 (5 SKU pilote)

### Coûts

| Poste | Fourchette |
|-------|------------|
| **Setup** | **1 – 3 M FCFA** |
| **Récurrent / mois** | **30 – 120 k FCFA** |
| Dont SaaS WhatsForm | 15 – 60 k *(~10–30 USD/mois)* |
| Dont webhook TraceO (dev léger) | inclus setup |
| Dont Meta | 0 – 50 k *(récap WA uniquement)* |
| Dont IA | 0 |

**Délai pilote : 2 – 4 semaines** (config + webhook + tests terrain)

### Avantages

1. **Time-to-value minimal** — POC en jours, pas mois
2. Données **structurées à la source** — pas de parsing IA
3. Webhook **standard** — branchement TraceO simple
4. Coût setup **le plus bas** du comparatif
5. Utile **transitoire** si A1 (Meta Flows) en attente validation
6. Même logique catalogue 3–5 produits que A5 (liste déroulante)

### Inconvénients

1. **Ouvre un lien** — pas in-chat ; geste ≠ message groupe
2. Outil **tiers** (disponibilité, CGU, données hors TraceO)
3. **Non officiel Meta** — distinct de WhatsApp Flows (A1)
4. Pas de panier multi-lignes natif (1 produit / submit — multi-submit possible)
5. Photos / vocaux **hors** formulaire (→ A2 parallèle)
6. **Dette** : migrer vers A5 ou A1 à moyen terme

### Risques et parades

| Risque | Parade |
|--------|--------|
| Technicien ignore le lien | Épingler groupe + QR container ; KPI usage |
| Dépendance SaaS | Export réponses ; migration A5 planifiée |
| Webhook down | Récap WA reste ; saisie DT secours |
| « Autre produit » mal saisi | Champ commentaire + rejet DT |

### KPI succès

- **≥ 75 %** EB standard via formulaire (vs message libre)
- **≥ 95 %** champs qté/unité corrects sans correction DT
- Délai lien → brouillon TraceO **< 5 min**

### Verdict

| Choisir si | Éviter si |
|------------|-----------|
| Besoin **POC < 1 mois** données propres | Stratégie long terme sans migration A5/A1 |
| Meta Flows (A1) **bloqué** > 8 sem. | Objectif = zéro geste hors groupe (→ A2/A7) |
| Budget setup **< 3 M** immédiat | Board exige **100 % souveraineté** stack TraceO |

### 10.1 A8 vs A1 vs A5

| Critère | **A8 WhatsForm** | **A1 Meta Flows** | **A5 Catalogue TraceO** |
|---------|------------------|-------------------|-------------------------|
| **Où s’ouvre** | Lien web mobile | **In-chat WhatsApp** | Lien / QR **TraceO** |
| **Setup** | 1 – 3 M · 2 – 4 sem. | 5 – 10 M · 10 – 14 sem. | 6 – 12 M · 10 – 14 sem. |
| **Récurrent** | 30 – 120 k | 150 – 400 k | 80 – 250 k |
| **Propriété** | SaaS tiers | Meta officiel | **TraceO** |
| **Multi-lignes EB** | Faible *(1 submit/ligne)* | Oui *(Flow)* | **Oui** *(panier)* |
| **Intégration BC/SA** | Webhook → brouillon | API Meta → TraceO | **Native** export fiche |
| **Rôle recommandé** | **POC / transitoire** | Structuré in-chat long terme | **Cible pilote J0–J90** |

---

## 11. Matrice comparative

### 11.1 Synthèse financière

| Option | Setup | Récurrent/mois | Meta | IA | Délai |
|--------|-------|----------------|------|-----|-------|
| **A1** | 5 – 10 M | 150 – 400 k | ●●● | — | 10 – 14 sem. |
| **A2** | 3 – 6 M | 50 – 200 k | ● | ●● | 6 – 8 sem. |
| **A3** | 4 – 7 M | 30 – 100 k | — | — | 8 – 12 sem. |
| **A4** | 8 – 14 M | 100 – 300 k | ●● | ● | 12 – 18 sem. |
| **A5** | 6 – 12 M | 80 – 250 k | ●● | ● | 10 – 14 sem. |
| **A6** | 5 – 9 M | 120 – 450 k | ●● | ●●● | 8 – 12 sem. |
| **A7** | 8 – 14 M | 200 – 600 k | ●●●● | ●●● | 10 – 16 sem. |
| **A8** | 1 – 3 M | 30 – 120 k | ● | — | 2 – 4 sem. |

*(● = intensité relative ; — = négligeable)*

### 11.2 Critères décisionnels

| Critère | A1 | A2 | A3 | A4 | A5 | A6 | A7 | A8 |
|---------|----|----|----|----|----|-----|-----|-----|
| Supprime ressaisie DT | ●●●● | ●●● | ● | ●●●● | ●●●● | ●●●● | ●●●● | ●●●● |
| Adoption terrain | ●●● | ●●●● | ●● | ●●● | ●●● | ●●●● | ●●●●● | ●●● |
| Coût initial | ●● | ●●● | ●●● | ● | ●● | ●● | ● | ●●●● |
| Coût récurrent | ●● | ●●● | ●●●● | ●●● | ●●● | ●● | ●● | ●●●● |
| Délai time-to-value | ●● | ●●●● | ●●● | ● | ●● | ●●● | ●● | ●●●●● |
| Réutilise TraceO | ●●● | ●●●● | ●●● | ●● | ●●●● | ●●● | ●●●● | ●● |
| Transformant métier | ●●● | ●● | ● | ●●●● | ●●● | ●●● | ●●●● | ●● |
| Risque technique | ●● | ●●● | ●●●● | ●● | ●●● | ●● | ● | ●●● |
| Maîtrise budget | ●● | ●●●● | ●●●● | ●● | ●●● | ●● | ●● | ●●●● |

### 11.3 Quadrant stratégique

```
                    Transformant
                         │
           A4 ●          │    ● A7
                         │    ● A5
                         │    ● A1
    Faible changement ───┼─── Fort changement terrain
    terrain              │
      A8 ●  A3 ●   ● A2  │    ● A6
                         │
                    Incremental
```

---

## 12. Recommandation

### 12.1 Choix principal : **A2 + A5**

| Composant | Rôle sur pilote |
|-----------|-----------------|
| **A5 Catalogue** | ~80 % besoins = 3–5 produits normalisés |
| **A2 Copilote DT** | Urgences / hors catalogue — **groupe WhatsApp inchangé** |

| Indicateur | Cible |
|------------|-------|
| Setup combiné | **6 – 10 M FCFA** |
| Délai première EB exportée | **8 – 10 semaines** |
| Ressaisie DT | **≤ 30 %** des EB |

### 12.2 Phasage proposé

| Phase | Contenu | Durée | Budget cumulé |
|-------|---------|-------|---------------|
| **0** *(optionnel)* | **A8** WhatsForm POC + webhook (lien épinglé) | 2 – 4 sem. | 1 – 3 M |
| **1** | A5 catalogue TraceO + export fiche EB | 6 sem. | 4 – 6 M |
| **2** | A2 copilote + Meta prod (pont, exceptions) | 4 sem. | +2 – 4 M |
| **3** *(gate J+60)* | A6 vocal si > 40 % vocaux | 6 sem. | +3 – 5 M |
| **4** *(gate J+90)* | A7 bot groupe si pont < 50 % **ou** journal complet requis | 8 sem. | +8 – 14 M |
| **Long terme** | A4 EB inversée après livraisons fiables | +12 sem. | +8 – 14 M |

> **Phase 0 :** lancer **A8** seulement si le board exige des EB structurées **avant** fin phase 1 A5, ou pour valider l’adoption « formulaire » sur 2 semaines. **Désactiver A8** dès A5 en production (éviter double canal).

### 12.3 Alternatives

| Si… | Alors… |
|-----|--------|
| Meta Flows validé < 10 sem. | **A1** remplace A5 pour saisie structurée |
| Board ultra-conservateur | **A3** transitoire 6 mois → puis A2+A5 |
| Budget serré, DT OK | **A2 seul** (6 – 8 sem., 3 – 6 M) |
| Adoption pont faible à J+90 | Étude **A7** (bot membre) vs renforcement formation pont |
| Setup **< 3 M** et délai **< 1 mois** | **A8** POC ([maquette](./BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md)) → migration A5 |

### 12.4 Non recommandé en entrée de pilote (J0–J90)

- **A3 seul** si objectif = supprimer ressaisie (sync ≠ suppression)
- **A4 seul** sans livraisons TraceO fiables
- **A6 seul** en big bang (coût STT sans preuve besoin vocal)
- **A7** en parallèle du pont — double canal, coût Meta + bruit ; **réévaluer à J+90** uniquement
- **A8 seul** comme cible finale — SaaS tiers, pas panier TraceO ; **POC transitoire uniquement**

### 12.5 A7 vs pont (rappel board)

| | **Pont A2** (pilote) | **Bot groupe A7** (gate J+90) |
|--|----------------------|-------------------------------|
| Geste terrain | Transfert / réponse au n° TraceO | Aucun — message dans le groupe |
| Fiabilité Meta | **Élevée** (API documentée) | **Conditionnelle** (capacités groupe) |
| Coût récurrent | Faible | Moyen–élevé |
| Journal fil complet | Partiel (messages captés) | Visé si ingestion OK |

### 12.6 A8 vs A1 vs A5 (rappel board)

| | **A8 WhatsForm** | **A1 Meta Flows** | **A5 TraceO** |
|--|------------------|-------------------|---------------|
| Délai | **2 – 4 sem.** | 10 – 14 sem. | 10 – 14 sem. |
| Coût setup | **1 – 3 M** | 5 – 10 M | 6 – 12 M |
| UX terrain | Lien web | **In-chat** | Lien / QR **TraceO** |
| Souveraineté | Tiers | Meta | **TraceO** |
| Usage recommandé | **POC / attente A5** | Long terme in-chat | **Pilote J0–J90** |

---

## 13. Décisions board

- [ ] Option retenue : A1 / A2 / A3 / A4 / A5 / A6 / A7 / A8 / **A2+A5 (recommandé)**
- [ ] POC transitoire **A8** (WhatsForm) : oui / non — date fin POC : _______________________
- [ ] Chantier pilote nommé : _______________________
- [ ] Budget setup plafond : _______________________ FCFA
- [ ] Budget récurrent plafond : _______________________ FCFA / mois
- [ ] Go Meta Business : oui / non — Référent : _______________________
- [ ] Mode capture pilote : **pont** / formulaire lien (A8) / bot groupe / les deux *(déconseillé J0)*
- [ ] Produits catalogue pilote (3–5) : _______________________
- [ ] Gate J+60 activation A6 (vocaux) : oui / non
- [ ] Gate J+90 réévaluation A7 (bot groupe) : oui / non
- [ ] Phase long terme A4 (EB inversée) : oui / reporter / N/A

---

## 14. Annexes

| Document | Lien |
|----------|------|
| Règles circuit achats | [BTP-REGLES-CIRCUIT-ACHATS.md](./BTP-REGLES-CIRCUIT-ACHATS.md) |
| Retex finance | [BTP-RETEX-QUESTIONNAIRE-FINANCE-2026.md](./BTP-RETEX-QUESTIONNAIRE-FINANCE-2026.md) |
| Présentation board | [BTP-PRESENTATION-BOARD.md](./BTP-PRESENTATION-BOARD.md) |
| Index documentation BTP | [BTP-INDEX.md](./BTP-INDEX.md) |
| Synthèse exécutive | [BTP-SYNTHESE-EXECUTIVE-DIRECTION.md](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) |
| WhatsApp dossier chantier | [BTP-WHATSAPP-DOSSIER-CHANTIER.md](./BTP-WHATSAPP-DOSSIER-CHANTIER.md) |
| **Maquette WhatsForm EB pilote** | [BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md](./BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md) |

---

*TraceO® BTP — Document de décision board — août 2026*
