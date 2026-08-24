# Synthèse exécutive — Évolution de TraceO BTP

**Diagnostic de l’existant et recommandations d’évolution**

| | |
|---|---|
| **Version** | 1.5 — 20 août 2026 |
| **Public** | Direction, board, DT, DAF, SA, PDG, Contrôle de gestion |
| **Statut** | Document de décision — circuit achats **opérationnel** (tenant pilote, hors prod) · **F01.1** enveloppe développé hors prod · F02–F07 et F09 au backlog TraceO · **F08 et F10 hors périmètre** |
| **PDF** | `TraceO_BTP-Synthese-Executive-Direction.pdf` |
| **Index docs** | [BTP-INDEX.md](./BTP-INDEX.md) |
| **Annexes** | Étude complète · Retex finance · Décisions DT · Spéc. F01 (dossier `docs/`) |
| **Source CDC** | Fadym Groupe, *Cahier des charges ERP — suivi budgétaire des chantiers* (F01–F10) |

---

## Table des matières

1. [Constat](#1-constat)
2. [Principales problématiques](#2-principales-problematiques)
3. [Vision d’évolution proposée](#3-vision-devolution-proposee)
4. [Couverture du CDC Fadym (F01–F07, F09)](#4-couverture-du-cdc-fadym-f01-f07-f09)
5. [Proposition de développement](#5-proposition-de-developpement)
6. [Bénéfices attendus](#6-benefices-attendus)
7. [Recommandation à la direction](#7-recommandation-a-la-direction)

---

## 1. Constat

Le processus d’approvisionnement des chantiers est **structuré et contrôlé**. Les responsabilités sont clairement réparties entre le chantier, le **Directeur Technique (DT)**, le **DAF / PDG**, le **Service Achats (SA)**, le **Service Financier** et le **contrôleur de gestion (CdG)**.

Le circuit actuel est globalement :

```
Expression de besoin → Validation DT → Service Achats émet BC → Validation DAF et/ou PDG → Fournisseur
    → Livraison → Contrôle financier (décaissement + reçu)
```

**Deux entrées distinctes** coexistent :

| Moment | Circuit |
|--------|---------|
| **Lancement chantier** | DT émet une EB **déboursé sec** (montant ventilé en lignes produits) → **SA émet BC** → DAF/PDG |
| **Exécution chantier** | Besoin terrain (WhatsApp) → validation DT → **SA émet BC** → validation DAF et/ou PDG |

Les achats sont **exclusivement** effectués par le **Service Achats**. Aucun achat ne doit être réalisé **sans BC**. Les **livreurs / chauffeurs n’achètent pas** : ils exécutent la **livraison** et la preuve de réception.

Les validations financières portent sur le **montant final du BC** émis par le SA (seuil **500 k FCFA**) :

| Montant BC (final) | Validateur | Dossier |
|--------------------|------------|---------|
| **≤ 500 000 FCFA** | **DAF** | BC seul, ou **BC + BT + facture pro forma** si pas de compte fournisseur |
| **> 500 000 FCFA** | **PDG** | Idem |

**Après validation :** le SA envoie la **photo BC** au fournisseur (WhatsApp). Aucun envoi avant approbation DAF/PDG.

Lorsque le signataire est absent, les validations peuvent être effectuées **via WhatsApp**, avec **capture d’écran** jointe au dossier — pratique déjà en place que TraceO formalise.

**Bon de trésorerie (BT) :** produit lorsque **FADYM ne possède pas de compte** chez le fournisseur. Le SA effectue alors l’achat **en présentiel** (espèces) ; la monnaie est restituée au service financier avec le reçu. Le BT **ne se déclenche pas sur le montant seul** — il est lié à l’**absence de compte fournisseur**.

### Le principal constat

Le problème identifié **n’est pas** l’absence de procédure ou de contrôle.

Le principal enjeu est que **l’information est dispersée** entre WhatsApp, Excel, documents physiques, BC, BL et justificatifs financiers — y compris l’**enveloppe chantier** du CdG (budget, avenants, engagé), aujourd’hui encore dans Excel.

**WhatsApp reste le canal terrain** — simple et adopté. TraceO doit en devenir le **dossier de référence**, sans imposer une autre application aux techniciens en phase pilote.

Il est ainsi difficile d’obtenir instantanément une vision consolidée :

| Question | Aujourd’hui |
|----------|-------------|
| Qu’est-ce qui a été **demandé** ? | WhatsApp + Excel |
| **Approuvé** ? | Validations dispersées (physique / WhatsApp) |
| **Commandé** ? | BC + registre SA |
| **Livré** / **reliquat** ? | Appel fournisseur + BL — peu consolidé pour le DT |
| **Consommé** / **disponible** ? | Estimation orale |
| **Budget / engagé / reste** ? | Excel CdG, sans lien automatique aux BC |

### Complément au contrôle financier

Le service financier et le contrôleur de gestion vérifient la **conformité du décaissement** et du **reçu** après achat.

Ils **ne vérifient pas** que le matériel **décaissé** a bien été **reçu sur le chantier** en quantité et en qualité attendues.

> **TraceO ne remplace pas le contrôle financier ni l’ERP comptable.** Il apporte la **preuve opérationnelle de réception chantier** et, via F01–F09, le **pilotage d’enveloppe** (budget, engagé, écarts) — le maillon entre Excel CdG, le BC et la réalité terrain.

---

## 2. Principales problématiques

### ① Manque de visibilité sur les commandes et livraisons

Le DT souhaite connaître rapidement les **quantités livrées** pour un chantier donné (partielles ou totales).

Une commande peut être livrée en plusieurs fois, mais le suivi **commandé / livré / reliquat** doit être davantage structuré.

**Enjeu :** savoir immédiatement ce qui reste à recevoir — **WhatsApp + dashboard** pour le DT.

### ② Gestion des livraisons partielles

Le fournisseur informe actuellement le Service Achats lorsqu’il ne peut livrer qu’une partie de la commande ; le **bon de livraison (BL)** permet ensuite de constater les quantités réellement livrées.

**Enjeu :** transformer cette information en **suivi numérique automatique** du reliquat, avec **alerte prioritaire** et possibilité d’EB complément.

### ③ Informations dispersées

Les échanges WhatsApp jouent un rôle central (besoins, validations, **envoi photo BC au fournisseur après approbation finance**).

**Enjeu :** conserver la simplicité de WhatsApp tout en faisant de TraceO la **source de référence** du dossier chantier (timeline, pièces, statuts).

### ④ Absence de lien direct entre approvisionnement et consommation

Le DT souhaite que le technicien indique quotidiennement **via WhatsApp** :

- les **travaux prévus** (matin) ;
- les **travaux réalisés** et le **matériel consommé** (soir).

Ces consommations doivent **mettre à jour le stock** du chantier. Les **seuils** sont définis par le **DT**.

### ⑤ Manque d’anticipation des ruptures

Le DT souhaite une **alerte** lorsque les quantités disponibles atteignent un seuil — **WhatsApp + dashboard**, sans commande automatique silencieuse.

À terme, l’historique des consommations et les **phases du chantier** pourraient permettre de **suggérer** un nouveau besoin (validation DT obligatoire).

### ⑥ Enveloppe chantier illisible hors Excel (CDC F01)

Le CdG ne dispose pas d’une **fiche affaire unique** : budget initial figé, avenants tracés, engagé (Σ BC) et reste à engager. Sans ce socle, aucun % financier ni alerte de dérive n’est calculable.

**Enjeu :** ouvrir le chantier et voir l’enveloppe **sans rouvrir Excel** — déjà amorcé en **F01.1** (hors production).

---

## 3. Vision d’évolution proposée

Nous recommandons de faire évoluer TraceO BTP autour d’une **boucle opérationnelle complète**, **plus** le pilotage budgétaire du CDC (hors comptabilité générale) :

```
BESOIN → ACHAT → LIVRAISON → STOCK → CONSOMMATION → NOUVEAU BESOIN
                ↘  enveloppe CdG (budget, avenants, engagé, écarts)
```

TraceO **génère** les documents SA (fiches EB, BT si pas de compte fournisseur, registre BC) — le SA **ne retape pas** Excel ; il valide, complète et émet le BC.

### Phase 1 — Digitaliser le processus existant

- Expression de besoin numérique (WhatsApp → brouillon → validation DT)
- EB **déboursé sec** ventilée (lancement chantier)
- **SA émet BC** (montant final) ; validation **DAF / PDG** sur le dossier BC (± BT + **facture pro forma**) ; envoi fournisseur **après** approbation
- Génération **BT** si pas de compte fournisseur
- Génération automatique du **BC** + exports registre SA
- Historique complet du **dossier chantier**
- Notifications de statut (accusés WhatsApp)
- **F01** — fiche chantier : budget initial gelé (CdG), avenants (DT propose / DAF approuve)

### Phase 1b — Visibilité livraisons (quick win DT)

- Suivi **commandé / livré / reliquat** par chantier
- Enregistrement du **BL** (photo / qtés)
- **Alerte automatique** livraison partielle (WhatsApp + dashboard)
- Lien **BC → tournée livreur → preuve** (crédit fournisseur)

*Priorité DT : livrer cette phase dès que le flux EB → BC est stable.*

### Phase 2 — Maîtriser les livraisons complémentaires + natures de charge

- Gestion des **livraisons partielles** et reliquats dans le temps
- Suivi des **livraisons complémentaires** / EB de complément
- Consolidation logistique (plusieurs BC, un enlèvement) si volume le justifie
- **F02** — nature de charge courte sur les lignes EB (pas le plan SYSCOHADA)

### Phase 3 — Connecter le terrain au stock et à l’avancement

- **Plan jour** et **bilan soir** technicien (WhatsApp) — **F07** couvert par ce canal, pas par une 3ᵉ appli
- Travaux réalisés + **matériel consommé** → sorties stock
- **Seuils d’alerte** (DT) — WhatsApp + dashboard
- Stock alimenté à la **livraison confirmée** (entrée automatique)
- **F05** — avancement physique par jalons WhatsApp (photos légendées)

### Phase 4 — Anticiper et piloter (CdG / direction)

```
Stock + consommation + phase du chantier + délai fournisseur
    → identification des risques de rupture
    → proposition d'un nouveau besoin (validation DT)
```

- **F03** — tableau budget vs réalisé (matériaux d’abord)
- **F04** — % d’avancement financier (engagé / budget)
- **F06** — alerte dérive si écart financier vs physique
- **F09** — vue consolidée multi-chantiers (4 chiffres : budget, engagé, % financier, % physique)

---

## 4. Couverture du CDC Fadym (F01–F07, F09)

Le cahier des charges Fadym décrit un **ERP de suivi budgétaire**. TraceO n’est **pas** cet ERP. Il reprend les **besoins opérationnels** F01–F07 et F09, adossés au circuit **EB → BC → livraison** déjà en place.

**Hors TraceO, volontairement :** **F08** (intégration comptabilité générale / SYSCOHADA) et **F10** (marchés sous-traitants, situations, retenues de garantie). Ces sujets restent un **ERP comptable / juridique**, pas le dossier chantier.

| ID | Besoin CDC | Dans TraceO | État | Comment TraceO le traite |
|----|------------|-------------|------|--------------------------|
| **F01** | Fiche chantier : budget initial + avenants | Oui | **F01.1 développé** (hors prod) | CdG gèle l’enveloppe (NIP). DT propose l’avenant ; DAF approuve. Engagé = Σ BC. Dépassement = **warning**, BC créable. |
| **F02** | Imputation chantier × nature de charge | Oui | À construire | Plan court (6–8 natures) sur les lignes EB. Pas le plan de comptes OHADA. |
| **F03** | Tableau budget vs réalisé | Oui | Après F01+F02 | Écarts **matériaux** (BC / livré vs budget). MO et frais généraux : plus tard. |
| **F04** | % d’avancement financier | Oui | Après F01 | Formule `engagé / budget_total` (CDC : dépenses engagées / budget). |
| **F05** | Saisie avancement physique | Oui | Aligné phase 3 | Jalons + photos via **WhatsApp** (décision DT D2) — pas de BIM, pas de 2ᵉ app terrain. |
| **F06** | Alertes de dérive budgétaire | Oui | Après F04+F05 | Si écart financier − physique > seuil : WhatsApp DT + badge dashboard. |
| **F07** | Saisie terrain (temps, matériaux) | Oui (canal) | Décision DT | **WhatsApp** plan matin / bilan soir. Pas d’application mobile chefs de chantier en 2026. |
| **F08** | Interface comptabilité générale | **Non** | Hors périmètre | Exports Excel SA déjà prévus. Journaux SYSCOHADA / API ERP : hors TraceO. |
| **F09** | Tableaux de bord multi-chantiers | Oui | Après F03/F04 | 4 chiffres par chantier pour la direction / CdG. |
| **F10** | Marchés ST, situations, RG | **Non** | Hors périmètre | Métier juridique / décompte. Un BC « service » ne remplace pas une situation de travaux. |

> **Promesse direction :** *on ouvre le chantier, on voit l’enveloppe, ce qui a été commandé, ce qui reste, puis les écarts — sans Excel et sans ERP.*

Spécification détaillée F01 : [BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md).

---

## 5. Proposition de développement

Cette section décrit **ce qui est déjà en pilote** et **ce qui reste à construire** pour couvrir F01–F07 et F09 — le pont entre la vision (§3), le CDC (§4) et le terrain.

> **Gouvernance :** le **circuit achats** (EB → BC → tournée) et **F01.1** (enveloppe) existent sur le **tenant pilote**, hors mise en production publique. L’aval board reste requis pour **déploiement production**, budget Meta/WhatsApp et enchaînement F02–F09.

### 5.1 Positionnement cible

- **TraceO Achats Chantier** = extension du module livraison déjà opérationnel (photos, quantités déclarées, code SMS responsable, certificat consultable).
- **WhatsApp conservé** comme entrée terrain ; TraceO devient le **dossier de référence**, le workflow d’approbation et la **fiche affaire CdG**.
- **Réutilisation** de l’investissement TraceO livreur — pas un silo achats, **pas un ERP SYSCOHADA**.

### 5.2 Le fil opérationnel cible

```
Message WhatsApp (ou saisie DT)
  → Brouillon EB structuré (lignes, quantités, chantier)
  → Validation DT (signature, fiche EB officielle)
  → Service Achats : prix, fournisseur, mode paiement, pièces jointes
  → DAF (et PDG si > 500 000 FCFA) : instruction + approbation tracée
  → SA émet le BC (document calqué sur le modèle papier)
  → L’engagé de l’enveloppe chantier se met à jour (F01)
  → Planification livraison → tournée livreur (dépôt fournisseur → chantier)
  → Livreur : parcours TraceO existant (photos, déclaration, OTP)
```

> **Une seule saisie du besoin** — plus de ressaisie Excel pour l’EB ; le SA valide et complète, il ne retape pas le message WhatsApp.

### 5.3 Espaces par rôle (pilote)

| Rôle | Ce que la solution offre / offrira |
|------|-------------------------------------|
| **Technicien** | WhatsApp (inchangé) — pas d’application supplémentaire (**F07**) |
| **DT** | Boîte EB, collage message, fiche vierge, validation, suivi, **proposition d’avenant** |
| **SA** | Dossiers à chiffrer, PJ, envoi finance, émission BC, warning si dépassement d’enveloppe, planification |
| **DAF / PDG** | Dossier complet avant approbation BC (seuil **500 k FCFA**) ; DAF **approuve les avenants** budget |
| **Contrôle de gestion** | Accueil **Suivi chantier** : gel enveloppe, lecture engagé / reste, historique avenants (**F01**, puis F03/F04/F09) |
| **Livreur** | Tournée préremplie depuis le BC — exécution livraison TraceO |

### 5.4 Phasage (après / autour de l’aval production)

| Phase | Périmètre | CDC | Livrable |
|-------|-----------|-----|----------|
| **Fait — pilote hors prod** | EB WhatsApp → approbations → BC, BT, exports, stock lecture | — | Tenant isolé, 1 chantier témoin |
| **Fait — F01.1 hors prod** | Enveloppe initiale, avenants, engagé, warning dépassement | **F01** | Bandeau Suivi chantier + I66–I72 |
| **1b** | Commandé / livré / reliquat, BL, alertes, BC → tournée → preuve | — | Dashboard DT + WhatsApp |
| **F02** | Nature de charge sur lignes EB | **F02** | Filtre CdG / achats |
| **F03–F04–F09** | Écarts, % financier, vue multi-chantiers | **F03, F04, F09** | Tableau CdG / direction |
| **3** | Journal WA, stock IN/OUT, seuils, jalons physiques | **F05, F07** | Stock + avancement |
| **4** | Alerte dérive physique vs financier ; suggestion EB | **F06** | Badge + WhatsApp DT |
| **Hors TraceO** | Journaux comptables, TVA, Mobile Money, marchés ST / RG | **F08, F10** | ERP / juridique |

### 5.5 Référentiels

- **Chantiers** (Privé / Public) et **fournisseurs** (compte ou non → circuit BT) dans le catalogue manager.
- Tenant pilote **isolé** pour ne pas mélanger avec les données livraison existantes.
- Rôle **`controle_gestion`** distinct du DAF et du DT.

### 5.6 Qualité et confiance

Chaque livrable passe par la **même porte de non-régression** que le module livraison : invariants métier explicites + tests automatisés avant chaque évolution (F01 : I66–I72).

### 5.7 Décisions board encore ouvertes

1. **Go production** du pilote Achats chantier + F01 sur TraceO  
2. **Périmètre** : 1 chantier nommé, 1 groupe WhatsApp = 1 chantier  
3. **Budget** Meta/WhatsApp + infra  
4. **Enchaînement** F02 → F03/F04/F09 → F05/F06  

F08 et F10 ne sont **pas** des décisions TraceO à trancher ici.

---

## 6. Bénéfices attendus

| Aujourd’hui | Cible TraceO BTP |
|-------------|------------------|
| Information dispersée | **Dossier numérique unique** par chantier |
| WhatsApp + Excel + documents | Workflow structuré ; **WhatsApp conservé** |
| Enveloppe CdG dans Excel | **Fiche affaire** budget / avenants / engagé (**F01**) |
| Fiches SA ressaisies | **Exports Excel générés** (EB, BT, registre) |
| Suivi manuel des livraisons | **Commandé / livré / reliquat** en temps réel |
| Livraison partielle par échange | **Alerte automatique** + action EB complément |
| Finance : reçu OK, chantier flou | **Preuve réception** liée au BC |
| Stock difficile à consolider | Stock chantier **actualisé** (bilan soir) |
| Consommation terrain séparée | Consommation **reliée au stock** (**F07** via WhatsApp) |
| Pas de % ni d’alerte de dérive | **F04 / F06** dès que F01+F05 tiennent |
| Vue direction absente | **F09** — 4 chiffres par chantier |
| Validation WhatsApp + capture | Validation **tracée** dans le dossier |

---

## 7. Recommandation à la direction

**Ne pas chercher à remplacer** le processus d’approvisionnement actuel, qui fonctionne et comporte déjà des contrôles solides (SA, finance, contrôleur de gestion, BC obligatoire).

**Ne pas chercher à remplacer** l’ERP comptable ni le juridique des marchés (F08, F10).

La recommandation est de **digitaliser progressivement** le circuit achats, de **connecter** l’achat à la **réalité opérationnelle du chantier**, et de donner au CdG une **fiche affaire** (F01–F07, F09) — là où Excel et le reçu financier ne vont pas aujourd’hui.

### Questions que la direction doit pouvoir trancher en quelques secondes

- Quels sont les **besoins en cours** ?
- Quelles **commandes** ont été passées ?
- Qu’est-ce qui a été **livré** ou **reste à livrer** ?
- Quel est le **budget**, l’**engagé**, le **reste** ?
- Quels chantiers ont des **stocks faibles** ?
- Quels matériaux sont **consommés rapidement** ?
- Quels besoins doivent être **anticipés** ?
- Y a-t-il une **dérive** financier vs physique ?

### Positionnement recommandé

> **TraceO BTP** devient la plateforme de **traçabilité du cycle d’approvisionnement et de consommation** des chantiers — de l’expression du besoin jusqu’à la consommation du matériel — **et de pilotage de l’enveloppe affaire** — **en complément** du contrôle financier et **sans** devenir l’ERP SYSCOHADA.

### Priorité recommandée

1. **Stabiliser le pilote 1 chantier** (circuit achats + **F01.1**) — tenant isolé  
2. **Phase 1b** : livraison / reliquat / alertes DT  
3. **F02 puis F03 / F04 / F09** — valeur CdG / direction  
4. **Phase 3** : stock + bilan soir WhatsApp + **F05**  
5. **F06** dès que financier et physique coexistent  
6. **Revue direction à J+30** avant extension multi-chantiers  

### Décisions déjà validées (DT + direction — août 2026)

| Sujet | Décision |
|-------|----------|
| Déboursé sec | Montant global **ventilé en lignes** par le DT → DAF |
| Journal quotidien | **WhatsApp** (plan matin, bilan soir + matériel) — **F07** |
| Alertes livraison | **WhatsApp + dashboard** ; priorité si partiel |
| Seuils stock | Définis par le **DT** |
| Enveloppe F01 | **CdG** gèle ; **DT propose / DAF approuve** l’avenant ; warning si BC > reste ; pas de PDG sur le budget |

### Prochaine validation attendue

- **Board** : go **production** pilote + budget Meta/WhatsApp  
- **Board** : enchaînement **F02 → F03/F04/F09**  
- **Board (EB)** : arbitrage options A1–A7 — voir [BTP-OPTIONS-DIGITALISATION-EB-BOARD.md](./BTP-OPTIONS-DIGITALISATION-EB-BOARD.md) (recommandation **A2+A5**, gates A6/A7)

---

*Document prêt pour présentation direction — index : [BTP-INDEX.md](./BTP-INDEX.md) — annexe technique : [BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md](./BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md)*
