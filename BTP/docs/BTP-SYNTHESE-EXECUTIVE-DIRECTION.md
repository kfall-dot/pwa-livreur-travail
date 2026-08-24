# Synthèse exécutive — Évolution de TraceO BTP

**Diagnostic de l’existant et recommandations d’évolution**

| | |
|---|---|
| **Version** | 1.2 — août 2026 (confirmations finance : seuil BC, BT + pro forma, envoi post-validation) |
| **Public** | Direction, board, DT, DAF, SA, PDG |
| **Statut** | Document de décision — aligné retex DT + questionnaire SA/Finance |
| **PDF** | `TraceO_BTP-Synthese-Executive-Direction.pdf` |
| **Annexes techniques** | Étude complète · Retex finance · Décisions DT (dossier `docs/`) |

---

## 1. Constat

Le processus d’approvisionnement des chantiers est **structuré et contrôlé**. Les responsabilités sont clairement réparties entre le chantier, le **Directeur Technique (DT)**, le **DAF / PDG**, le **Service Achats (SA)**, le **Service Financier** et le **contrôleur de gestion**.

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

Lorsque le signataire est absent, les validations peuvent être effectuées **via WhatsApp**, avec **capture d’écran** jointe au dossier — pratique déjà en place que TraceO formalisera.

**Bon de trésorerie (BT) :** produit lorsque **FADYM ne possède pas de compte** chez le fournisseur. Le SA effectue alors l’achat **en présentiel** (espèces) ; la monnaie est restituée au service financier avec le reçu. Le BT **ne se déclenche pas sur le montant seul** — il est lié à l’**absence de compte fournisseur**.

### Le principal constat

Le problème identifié **n’est pas** l’absence de procédure ou de contrôle.

Le principal enjeu est que **l’information est dispersée** entre WhatsApp, Excel, documents physiques, BC, BL et justificatifs financiers.

**WhatsApp reste le canal terrain** — simple et adopté. TraceO doit en devenir le **dossier de référence**, sans imposer une autre application aux techniciens en phase pilote.

Il est ainsi difficile d’obtenir instantanément une vision consolidée :

| Question | Aujourd’hui |
|----------|-------------|
| Qu’est-ce qui a été **demandé** ? | WhatsApp + Excel |
| **Approuvé** ? | Validations dispersées (physique / WhatsApp) |
| **Commandé** ? | BC + registre SA |
| **Livré** / **reliquat** ? | Appel fournisseur + BL — peu consolidé pour le DT |
| **Consommé** / **disponible** ? | Estimation orale |

### Complément au contrôle financier

Le service financier et le contrôleur de gestion vérifient la **conformité du décaissement** et du **reçu** après achat.

Ils **ne vérifient pas** que le matériel **décaissé** a bien été **reçu sur le chantier** en quantité et en qualité attendues.

> **TraceO ne remplace pas le contrôle financier.** Il apporte la **preuve opérationnelle de réception chantier** — le maillon manquant entre le reçu comptable et la réalité terrain.

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

---

## 3. Vision d’évolution proposée

Nous recommandons de faire évoluer TraceO BTP autour d’une **boucle opérationnelle complète** :

```
BESOIN → ACHAT → LIVRAISON → STOCK → CONSOMMATION → NOUVEAU BESOIN
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

### Phase 1b — Visibilité livraisons (quick win DT)

- Suivi **commandé / livré / reliquat** par chantier
- Enregistrement du **BL** (photo / qtés)
- **Alerte automatique** livraison partielle (WhatsApp + dashboard)
- Lien **BC → tournée livreur → preuve** (crédit fournisseur)

*Priorité DT : livrer cette phase dès que le flux EB → BC est stable.*

### Phase 2 — Maîtriser les livraisons complémentaires

- Gestion des **livraisons partielles** et reliquats dans le temps
- Suivi des **livraisons complémentaires** / EB de complément
- Consolidation logistique (plusieurs BC, un enlèvement) si volume le justifie

### Phase 3 — Connecter le terrain au stock

- **Plan jour** et **bilan soir** technicien (WhatsApp)
- Travaux réalisés + **matériel consommé** → sorties stock
- **Seuils d’alerte** (DT) — WhatsApp + dashboard
- Stock alimenté à la **livraison confirmée** (entrée automatique)

### Phase 4 — Anticiper

À terme :

```
Stock + consommation + phase du chantier + délai fournisseur
    → identification des risques de rupture
    → proposition d'un nouveau besoin (validation DT)
```

---

## 4. Bénéfices attendus

| Aujourd’hui | Cible TraceO BTP |
|-------------|------------------|
| Information dispersée | **Dossier numérique unique** par chantier |
| WhatsApp + Excel + documents | Workflow structuré ; **WhatsApp conservé** |
| Fiches SA ressaisies | **Exports Excel générés** (EB, BT, registre) |
| Suivi manuel des livraisons | **Commandé / livré / reliquat** en temps réel |
| Livraison partielle par échange | **Alerte automatique** + action EB complément |
| Finance : reçu OK, chantier flou | **Preuve réception** liée au BC |
| Stock difficile à consolider | Stock chantier **actualisé** (bilan soir) |
| Consommation terrain séparée | Consommation **reliée au stock** |
| Besoin identifié en urgence | **Anticipation** par seuils (puis historique) |
| Validation WhatsApp + capture | Validation **tracée** dans le dossier |

---

## 5. Recommandation à la direction

**Ne pas chercher à remplacer** le processus d’approvisionnement actuel, qui fonctionne et comporte déjà des contrôles solides (SA, finance, contrôleur de gestion, BC obligatoire).

La recommandation est de le **digitaliser progressivement** et de **connecter** le processus d’achat à la **réalité opérationnelle du chantier** — là où le contrôle financier du reçu ne va pas aujourd’hui.

### Questions que la direction doit pouvoir trancher en quelques secondes

- Quels sont les **besoins en cours** ?
- Quelles **commandes** ont été passées ?
- Qu’est-ce qui a été **livré** ou **reste à livrer** ?
- Quels chantiers ont des **stocks faibles** ?
- Quels matériaux sont **consommés rapidement** ?
- Quels besoins doivent être **anticipés** ?

### Positionnement recommandé

> **TraceO BTP** devient la plateforme de **traçabilité du cycle d’approvisionnement et de consommation** des chantiers — de l’expression du besoin jusqu’à la consommation du matériel sur le terrain — **en complément du contrôle financier existant** sur les décaissements.

### Priorité recommandée

1. **Pilote 1 chantier** — tenant isolé, 1 groupe WhatsApp = 1 chantier  
2. **Phase 1 + 1b** : EB (dont déboursé sec) → approbation → BC → **livraison / reliquat / alertes DT**  
3. **Phase 3** : stock + bilan soir WhatsApp (dès livraisons fiables)  
4. **Revue direction à J+30** avant extension multi-chantiers  

### Décisions déjà validées (DT — août 2026)

| Sujet | Décision |
|-------|----------|
| Déboursé sec | Montant global **ventilé en lignes** par le DT → DAF |
| Journal quotidien | **WhatsApp** (plan matin, bilan soir + matériel) |
| Alertes livraison | **WhatsApp + dashboard** ; priorité si partiel |
| Seuils stock | Définis par le **DT** |

### Prochaine validation attendue

- **DAF / SA** : circuit BT (pas de compte fournisseur) et format exports  
- **Board** : périmètre pilote, budget Meta/WhatsApp, go Phase 1  
- **Board (EB)** : arbitrage options A1–A7 — voir [BTP-OPTIONS-DIGITALISATION-EB-BOARD.md](./BTP-OPTIONS-DIGITALISATION-EB-BOARD.md) (recommandation **A2+A5**, gates A6/A7)

---

*Document prêt pour présentation direction — annexe technique : BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md*
