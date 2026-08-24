# TraceO® — Fiche de présentation

**La plateforme de traçabilité des opérations terrain.**  
Photos · quantités déclarées · code SMS du responsable du point · certificat consultable.

Démonstration en ligne : [pwa-livreur.netlify.app](https://pwa-livreur.netlify.app)

---

## 1. Résumé

**TraceO®** est une plateforme SaaS de **planification, d’exécution et de traçabilité des livraisons B2B**, pensée pour le terrain en **Côte d’Ivoire**.

Elle s’adresse aux entreprises qui envoient régulièrement des marchandises (palettes, caisses, colis, produits divers) vers des **points de vente, dépôts, chantiers ou sites clients**, et qui ont besoin non seulement de « savoir où est le camion », mais de **prouver ce qui a été livré** — ou refusé, ou livré en partie.

### Ce que la plateforme couvre

| Domaine | Contenu |
|---------|---------|
| **Organisation** | Catalogue produits, points de livraison, flotte livreurs, tournées multi-arrêts |
| **Exécution** | Application livreur sur smartphone (installable), carte, parcours guidé par arrêt |
| **Preuve** | Photos, déclaration des quantités par produit, validation par code SMS, certificat |
| **Pilotage** | Suivi des statuts, tâches automatiques (partiel, manqué, réaffectation), replanification |
| **Multi-entreprises** | Chaque compagnie a son espace isolé sur une plateforme unique |

### En une phrase

Remplacer la chaîne **Excel → WhatsApp → « on m’a dit »** par un parcours structuré **planifié → livré → prouvé**, utilisable le jour même par le bureau et le livreur.

### Pour qui lire cette fiche

Dirigeants, responsables logistique / exploitation / opérations, et décideurs qui évaluent un outil de terrain avant un pilote ou un déploiement multi-sites.

---

## 2. Contexte et problématique

### 2.1 Contexte métier

En distribution et livraison B2B, le « dernier kilomètre » vers le point de vente ou le site client reste souvent le maillon le moins industrialisé :

- le **plan** (qui livre quoi, où, quand) est fait au bureau ;
- l’**exécution** se joue sur la route, avec des aléas (responsable absent, stock refusé, quantité incomplète, retard) ;
- la **preuve** — si elle existe — repose sur un message, une photo isolée, ou la mémoire des personnes.

Or, c’est précisément à cet endroit que naissent les **litiges commerciaux**, les **écarts de stock**, les **relances clients** et la perte de confiance entre le siège, le livreur et le point de livraison.

### 2.2 Comment ça se passe aujourd’hui (souvent)

| Étape | Pratique courante | Faiblesse |
|-------|-------------------|-----------|
| Planification | Excel, papier, messages vocaux | Versions multiples, oublis, pas d’historique propre |
| Transmission au livreur | WhatsApp, appel | Pas de « source de vérité » unique |
| Sur place | Signature papier, photo floue, ou rien | Preuve non standardisée, difficile à retrouver |
| Écart / refus | Discussion téléphonique | Pas de quantités structurées ni de motif tracé |
| Reliquat | Nouvelle saisie manuelle | Double travail, erreurs, perte de lien avec la commande d’origine |
| Contrôle a posteriori | Recherche dans les conversations | Impossible d’auditer proprement une semaine de tournées |

### 2.3 Impacts pour l’entreprise

1. **Litiges coûteux** — sans preuve partagée, chaque écart devient une négociation.
2. **Temps d’encadrement** — le responsable passe sa journée à relancer plutôt qu’à piloter.
3. **Qualité de service perçue** — le client point de vente n’a pas non plus de trace claire.
4. **Flotte difficile à manager** — qui a livré quoi ? qui a un reliquat ? qui est en retard ?
5. **Croissance freinée** — plus de livreurs et de points = plus de chaos si le processus reste informel.

### 2.4 Ce dont le marché a réellement besoin

Pas forcément un ERP ou un WMS complet dès le premier jour. Le besoin prioritaire, pour beaucoup de PME et d’opérateurs de livraison B2B, est :

> Un outil **léger à prendre en main**, utilisable **sur téléphone ivoirien**, qui impose un **parcours de preuve** à chaque arrêt, et qui donne au bureau une **vue opérationnelle** (statuts, quantités, certificats, tâches à traiter).

C’est ce vide — entre le tableur et les suites logistiques lourdes — que TraceO® vise.

---

## 3. Solution

### 3.1 Vision produit

**TraceO®** connecte deux rôles sur les mêmes données :

- le **gestionnaire** prépare et pilote (catalogue, flotte, tournées, suivi, tâches) ;
- le **livreur** exécute sur smartphone (tournée du jour, carte, photos, déclaration, OTP, certificat).

Chaque **entreprise cliente** dispose de son propre espace : produits, points, livreurs et tournées ne se mélangent pas avec ceux des autres compagnies.

### 3.2 Architecture fonctionnelle (vue métier)

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  GESTIONNAIRE               │     │  LIVREUR (smartphone)        │
│  Planifier · Suivre ·       │◄───►│  Tournée · Carte · Preuve    │
│  Catalogue · Livreurs ·     │     │  Photos · OTP · Certificat   │
│  Tâches                     │     │                              │
└─────────────────────────────┘     └──────────────────────────────┘
                 │
                 ▼
        Espace entreprise isolé
        (produits, points, flotte, tournées)
```

### 3.3 Côté gestionnaire — capacités détaillées

**Authentification**  
Connexion par e-mail et mot de passe. Session dédiée au tableau de bord manager.

**Catalogue produits**  
Création et maintenance des articles livrables : libellé, unité (palette, caisse, kg, colis, carton, plateau, sac, bidon, unité), activation / désactivation. Ce catalogue alimente la planification : on ne « invente » pas les produits à chaque tournée.

**Points de livraison**  
Fiche point (supermarché, dépôt, chantier, etc.) : nom, adresse, coordonnées, contact responsable, **téléphone du responsable pour la validation SMS**. Un point inactif n’est plus proposé pour de nouvelles tournées.

**Livreurs**  
Création d’un compte livreur (nom, téléphone +225, PIN). Suivi du statut actif / suspendu. La désactivation d’un livreur qui a encore des tournées futures génère des **tâches de réaffectation** pour ne pas laisser des commandes orphelines.

**Planification de tournées**  
Pour une date donnée : choix du livreur, dépôt (nom + adresse), créneau, puis **plusieurs arrêts**. Chaque arrêt référence un point du catalogue, une ou plusieurs lignes produits (quantité + unité), une référence de commande, un créneau, le nombre de photos requises, des instructions. Les arrêts déjà livrés restent en lecture seule ; les autres peuvent être modifiés.

**Suivi des livraisons**  
Vue filtrable par date et statut (à démarrer, en cours, en attente OTP, livré, échoué…). Indicateurs (total, validées, en attente). Liste groupée par tournée. Détail d’une livraison : quantités attendues vs livrées, déclaration livreur, photos, lien certificat, accès à la modification / replan.

**Replanification**  
Quand le terrain ne se déroule pas comme prévu : replanifier une tournée complète, ou un **reliquat partiel**, sans tout reconstruire à la main. Les arrêts non livrés de l’ancienne tournée sont correctement clôturés / supersédés pour éviter les doublons.

**Tâches opérationnelles**  
Le système crée des tâches selon les événements : livraison confirmée, livraison partielle, livraison manquée / échouée, annulation, réaffectation. Le gestionnaire peut ouvrir la livraison, la tournée, replanifier si éligible, ou marquer la tâche comme traitée.

### 3.4 Côté livreur — capacités détaillées

**Accès simple**  
Téléphone ivoirien (+225, saisie possible en `07…`) + PIN. Pas de compte Google obligatoire, pas de passage forcé par un store d’applications : l’app s’utilise dans le navigateur et peut s’installer comme application (PWA).

**Tableau de bord du jour**  
Liste des arrêts de la date sélectionnée, calendrier des jours avec livraisons, progression (% livrés), cartes d’arrêt (séquence, statut, adresse, contenu, créneau). Plusieurs tournées le même jour sont présentées de façon unifiée pour le chauffeur.

**Carte**  
Visualisation du dépôt, des arrêts et de l’itinéraire ; position GPS si autorisée ; accès rapide à une livraison depuis la carte.

**Parcours d’un arrêt (cœur de la preuve)**

| Étape | Rôle |
|-------|------|
| **Démarrer** | Le livreur démarre l’arrêt (contrôle de proximité du point) |
| **Photos** | Prise de photos (nombre configurable selon la tournée) |
| **Déclaration** | Complet, **partiel** ou **refusé** — ligne par produit (accepté / refusé / motif) |
| **OTP SMS** | Un code est envoyé au téléphone du **responsable du point** ; le livreur le saisit (renvoi possible) |
| **Confirmation** | Validation → génération d’un **certificat de livraison** consultable ensuite |

Le livreur peut consulter un arrêt déjà clôturé (quantités attendues / livrées, statut adapté). Un historique du jour et les liens certificat sont accessibles depuis le profil.

**Usage terrain**  
Conçu pour un usage quotidien sur smartphone, y compris avec cache local et reprise quand le réseau revient (certaines étapes critiques comme l’OTP restent liées au réseau).

### 3.5 Une journée type (scénario)

1. **07h30 — Bureau** : le gestionnaire planifie la tournée de Kouassi : 4 arrêts Abidjan, produits du catalogue (ex. 3 palettes + 12 caisses), créneaux, instructions.
2. **08h00 — Livreur** : Kouassi se connecte, voit sa liste et la carte, part du dépôt.
3. **Arrêt 1** : démarrage près du point → photos → déclaration complète → SMS au responsable → code saisi → certificat généré.
4. **Arrêt 2** : le point n’accepte que la moitié → déclaration **partielle** documentée → le bureau reçoit une tâche « partielle ».
5. **Après-midi — Bureau** : consultation des quantités, photos, certificat ; **replan** du reliquat pour le lendemain sans ressaisir toute la commande.
6. **Fin de journée** : vue claire de ce qui est livré, partiel, en attente ou à retraiter.

### 3.6 Mise en service d’une entreprise

1. Créer l’espace entreprise (inscription ou onboarding accompagné).  
2. Renseigner le catalogue **produits** et les **points** (avec téléphone responsable OTP).  
3. Créer 1 à N **livreurs**.  
4. Planifier une première tournée pilote.  
5. Exécuter le parcours complet sur un téléphone réel.  
6. Généraliser aux tournées quotidiennes, puis traiter les tâches / replans au fil de l’eau.

**Liens utiles**

| Action | URL |
|--------|-----|
| Créer un espace | [pwa-livreur.netlify.app/manager/register](https://pwa-livreur.netlify.app/manager/register) |
| Connexion manager | [pwa-livreur.netlify.app/manager/login](https://pwa-livreur.netlify.app/manager/login) |
| App livreur | [pwa-livreur.netlify.app](https://pwa-livreur.netlify.app) |

### 3.7 Périmètre volontaire (ce que la solution n’essaie pas d’être)

TraceO® se concentre sur la **boucle livraison opérationnelle**. Ce n’est pas, à ce stade :

- un ERP / une comptabilité / une facturation automatisée ;
- un WMS d’entrepôt complet ;
- une solution de branding white-label par client.

Ce recentrage permet une **prise en main rapide** et un pilote sur de vraies tournées sans projet de transformation de 12 mois.

---

## 4. Marché cible

### 4.1 Segment prioritaire

Entreprises qui :

- livrent en **B2B** (point de vente, dépôt, site, chantier) ;
- ont un **volume régulier** de tournées (plusieurs arrêts / jour ou / semaine) ;
- manipulent des **quantités et unités métier** (pas seulement « 1 colis ») ;
- subissent déjà des **litiges** ou un manque de preuve à l’arrivée ;
- disposent d’au moins un **responsable au bureau** et d’une **flotte** (salariée ou dédiée).

### 4.2 Typologies d’entreprises

| Typologie | Exemples d’usage | Pourquoi TraceO® convient |
|-----------|------------------|-------------------------------|
| **Grossistes / distributeurs** | Livraison magasins, dépôts régionaux | Catalogue produits + preuve quantité |
| **Opérateurs de livraison B2B** | Flotte multi-clients ou multi-sites | Espaces isolés, suivi, replan |
| **Industriels / producteurs** | Livraison clients ou enseignes | Certificat et traçabilité par arrêt |
| **Fournisseurs chantiers / BTP** | Sites avec responsable sur place | OTP SMS au contact du point |
| **Centrales / filiales régionales** | Plusieurs équipes locales | Même plateforme, espaces séparés si besoin |

### 4.3 Profils décideurs et utilisateurs

| Rôle | Attente principale |
|------|--------------------|
| **Directeur / gérant PME** | Réduire les litiges, professionnaliser l’image, piloter sans usine à gaz |
| **Responsable logistique / exploitation** | Planifier, suivre, replanifier, avoir des preuves pour l’interne et le client |
| **Superviseurs / dispatch** | Tâches claires (partiel, manqué, réaffectation), moins de relances WhatsApp |
| **Livreurs** | Parcours simple, téléphone + PIN, pas de formation longue |
| **Responsable du point de livraison** | Valider par SMS sans installer d’application |

### 4.4 Géographie et contexte local

- **Priorité : Côte d’Ivoire** — numéros +225, usage smartphone courant, points de livraison urbains (ex. Abidjan) et périurbains.
- Parcours conçu pour un responsable joignable par **SMS** sur place.
- Unités et vocabulaire adaptés à la distribution (palette, caisse, etc.).
- Déploiement multi-entreprises : plusieurs compagnies ivoiriennes (ou filiales) peuvent cohabiter sur la même plateforme sans partager leurs données.

### 4.5 Signaux d’achat (quand le besoin est « chaud »)

- Litiges récurrents sur les quantités livrées  
- Clients points de vente qui demandent une meilleure preuve  
- Croissance de la flotte (passage de 2 à 10+ livreurs)  
- Perte de temps massive sur WhatsApp / Excel  
- Volonté de professionnaliser l’exploitation avant d’investir dans un ERP  

### 4.6 Hors cible (phase actuelle)

| Hors cible | Pourquoi |
|------------|----------|
| Pure livraison B2C e-commerce grand public | Besoin différent (créneaux particuliers, densités, app client finale) |
| Remplacement d’un ERP / outil de facturation | Hors périmètre produit actuel |
| Entreprises sans besoin de preuve à l’arrêt | Peu de valeur perçue vs Excel |
| Organisations sans smartphone terrain | Le livreur est un acteur clé du parcours |

### 4.7 Modèle d’adoption recommandé

1. **Pilote** : 1 entreprise, 1–2 livreurs, un sous-ensemble de points et produits.  
2. **Mesure** : litiges évités, temps de replan, taux de preuves complètes.  
3. **Extension** : toute la flotte, puis éventuelle ouverture à d’autres filiales / compagnies.

---

## 5. Positionnement et avantages concurrentiels

### 5.1 Positionnement

> **TraceO® = la preuve de livraison opérationnelle pour le B2B terrain**, entre le couple Excel/WhatsApp et les suites logistiques / ERP.

Proposition de valeur :

- **Pour le bureau** : planifier, voir, corriger, archiver la preuve.  
- **Pour le livreur** : un parcours clair, sans friction.  
- **Pour le point de livraison** : valider sans installer d’outil.  
- **Pour l’entreprise** : un espace dédié, prêt à cohabiter avec d’autres clients sur la même plateforme.

### 5.2 Carte concurrentielle (simplifiée)

| Approche | Force | Faiblesse | TraceO® |
|----------|-------|-----------|-------------|
| **Excel + WhatsApp** | Gratuit, familier | Pas de preuve structurée, pas d’audit | Remplace la chaîne opérationnelle |
| **Tracking GPS / flotte seul** | Position du véhicule | Ne prouve pas les quantités ni l’accord du point | Ajoute la preuve métier (déclaration + OTP) |
| **Signature papier** | Habitude terrain | Perte, fraude, non digital | Digitalise et centralise |
| **Suite TMS / ERP** | Couverture large | Coût, délai, complexité pour le livreur | Plus léger, focalisé livraison + preuve |
| **App étrangère non localisée** | Fonctions avancées | Friction +225, OTP local, unités, prise en main | Pensé pour le contexte CI |

### 5.3 Avantages concurrentiels détaillés

**1. Preuve à trois niveaux (différenciateur central)**  
Ce n’est pas seulement « le livreur a cliqué sur Livré ». À chaque arrêt validé, on cumule :

- des **photos** ;
- une **déclaration structurée** (complet / partiel / refus, par produit) ;
- une **validation du responsable du point** via code SMS ;
- un **certificat** consultable ensuite par le gestionnaire.

**2. Le terrain « qui dérape » est prévu dans le produit**  
Partiel, refus, manqué, replan, réaffectation : ce ne sont pas des cas exotiques gérés hors système. Ils génèrent des **statuts** et des **tâches** exploitables au bureau.

**3. Catalogue métier, pas des champs libres jetables**  
Produits et points sont des référentiels. Le planifié et le livré restent **comparables** (attendu vs livré), ce qui est la base de tout contrôle et de tout litige.

**4. Friction minimale côté livreur**  
Téléphone + PIN, PWA installable, parcours guidé. Moins de résistance à l’adoption que des outils qui exigent un store, un e-mail pro, ou une formation longue.

**5. Validation par le point sans application tierce**  
Le responsable reçoit un SMS : il n’a pas besoin d’installer TraceO®. C’est un avantage fort en B2B où l’on ne contrôle pas le terminal du client.

**6. Multi-entreprise natif**  
Une plateforme, plusieurs compagnies, données isolées. Adapté à un éditeur / opérateur qui sert plusieurs clients, ou à un groupe avec plusieurs entités — sans déployer une instance logicielle par compagnie.

**7. Time-to-value court**  
Inscription ou onboarding → catalogues → livreurs → première tournée prouvée le jour même. Le pilote se juge sur des **vraies livraisons**, pas sur un projet d’intégration de six mois.

### 5.4 Synthèse des messages clés (pitch)

1. « On ne remplace pas votre ERP demain : on **sécurise la preuve de livraison dès aujourd’hui**. »  
2. « Le livreur livre ; le responsable du point **valide par SMS** ; vous gardez le **certificat**. »  
3. « Partiel, refus, replan : ce n’est plus un chaos WhatsApp, c’est un **parcours**. »  
4. « Chaque entreprise a **son espace** ; une seule plateforme à utiliser. »  
5. « Conçu pour la **Côte d’Ivoire** et le B2B terrain, pas pour un usage générique importé. »

### 5.5 Critères de succès d’un pilote (pour le client)

| Indicateur | Objectif typique |
|------------|------------------|
| % d’arrêts avec preuve complète (photos + OTP + certificat) | En forte hausse vs avant |
| Temps pour replanifier un reliquat | En baisse nette |
| Nombre de litiges « sans trace » | En baisse |
| Adoption livreurs (connexion quotidienne) | Stable après 1–2 semaines |
| Charge WhatsApp / appels de dispatch | En baisse |

---

## Annexe — Maquettes UI (refonte TraceO®)

Captures de référence pour le pitch et l’alignement produit (identité vert forêt / orange) :

| Écran | Fichier |
|-------|---------|
| Livreur — liste tournée | [`maquettes/maquette-livreur-liste.png`](maquettes/maquette-livreur-liste.png) |
| Livreur — détail arrêt | [`maquettes/maquette-livreur-detail.png`](maquettes/maquette-livreur-detail.png) |
| Manager — Suivi | [`maquettes/maquette-manager-suivi.png`](maquettes/maquette-manager-suivi.png) |
| Manager — Planifier | [`maquettes/maquette-manager-planifier.png`](maquettes/maquette-manager-planifier.png) |
| Logo / mark | [`maquettes/logo-concept-2-final.png`](maquettes/logo-concept-2-final.png) |

---

## Annexe — Guide démo live (board)

**Script complet 40 min :** [`PRESENTATION-LIVE-SCRIPT.md`](PRESENTATION-LIVE-SCRIPT.md)  
**Slides (11 diapos) :** [`PRESENTATION-SLIDES.md`](PRESENTATION-SLIDES.md) · **Deck HTML :** [`presentation-deck.html`](presentation-deck.html) (flèches clavier)  
**Journal test sec :** [`PRESENTATION-DRY-RUN-LOG.md`](PRESENTATION-DRY-RUN-LOG.md)

**À ouvrir le jour J** (15 min avant) :

| Étape | Action |
|-------|--------|
| 1 | Lancer le test sec : `DELIVERY_ID=del-k3 npm run presentation:dry-run` |
| 2 | Manager : [Connexion](https://pwa-livreur.netlify.app/manager/login) → onglet **Suivi** (date du jour) |
| 3 | Téléphone : compte **Aya** `0700430402` / PIN `1234` sur [l’app livreur](https://pwa-livreur.netlify.app) |
| 4 | Parcours live : arrêt Abidjan → démarrer → photo → déclarer → OTP SMS → confirmer |
| 5 | Retour manager : rafraîchir Suivi → détail livraison → certificat |

**Comptes démo (prod pilote)**

| Rôle | Identifiant | Secret |
|------|-------------|--------|
| Manager | `kfallet@gmail.com` | `admin1234` *(sauf si reset)* |
| Livreur (OTP live recommandé) | `0700430402` | `1234` |
| Livreur (alternatif) | `0701234567` | `1234` |

> Ne pas utiliser `manager@demo.fr` en prod — e-mail historique seed. Voir checklist J-0 dans [`PRESENTATION-LIVE-SCRIPT.md`](PRESENTATION-LIVE-SCRIPT.md).

**Scripts utiles**

- Test sec OTP : [`scripts/presentation-dry-run.sh`](../scripts/presentation-dry-run.sh)
- Corriger numéros OTP fictifs : [`scripts/fix-demo-otp-phones.sh`](../scripts/fix-demo-otp-phones.sh)
- Checklist complète : [`CHECKLIST-JOUR-J-PILOTE.md`](CHECKLIST-JOUR-J-PILOTE.md)

---

## Prochaine étape

Nous recommandons un **pilote** sur vos tournées réelles : vos points, vos produits, 1 à 2 livreurs, une à deux semaines d’exploitation, puis revue des indicateurs ci-dessus.

| | |
|---|---|
| **Démonstration** | [pwa-livreur.netlify.app](https://pwa-livreur.netlify.app) |
| **Créer un espace** | [pwa-livreur.netlify.app/manager/register](https://pwa-livreur.netlify.app/manager/register) |
| **Contact / demande de pilote** | kfallet@gmail.com · 225 07 00 43 04 02 |
| **Site** | [pwa-livreur.netlify.app](https://pwa-livreur.netlify.app) |

*— Document commercial — capacités disponibles sur la plateforme (août 2026).*
