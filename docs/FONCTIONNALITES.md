# Fonctionnalités — PWA Livreur & Dashboard Gestionnaire

Synthèse des capacités **présentes dans ce dépôt** (`pwa-livreur`), alignée sur le code au **août 2026**.

Public cible : **Côte d'Ivoire** (+225). Déploiement typique : **Netlify** (frontend + Functions + Postgres).

---

## Vue d'ensemble

| Interface | URL | Utilisateurs | Authentification |
|-----------|-----|--------------|------------------|
| **PWA Livreur** | `/`, `/map`, `/profile`, `/delivery/:id` | Chauffeurs | Téléphone `+225` + PIN 4 chiffres |
| **Dashboard Gestionnaire** | `/manager` | Managers / admins | E-mail + mot de passe (cookie session) |
| **API REST** | `/api/v1/*` | Les deux apps | JWT livreur · cookie / JWT manager |

```
┌──────────────────────┐     ┌──────────────────────────┐
│  PWA Livreur         │     │  Dashboard Gestionnaire  │
│  (React PWA)         │     │  (React, /manager)       │
└──────────┬───────────┘     └────────────┬─────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
                 ┌─────────────────┐
                 │  API Express    │
                 │  + Postgres     │
                 │  + Netlify Blobs│
                 └─────────────────┘
```

> Référence historique : le monorepo **Livraison** (`dashboard-web` :5175) reste la spec d'origine. Voir [`MANAGER-PARITY-5175.md`](./MANAGER-PARITY-5175.md) pour les écarts.

---

## 1. PWA Livreur

### 1.1 Authentification

- Connexion par **téléphone** (format `+225` + 10 chiffres ou saisie locale `07…`) et **PIN** à 4 chiffres.
- Session JWT + refresh token ; déconnexion depuis le profil.
- Compte démo seed : `+2250701234567` / PIN `1234` (voir [`TELEPHONES-CI.md`](./TELEPHONES-CI.md)).

### 1.2 Tableau de bord (`/`)

- Liste des **arrêts** de la tournée pour la date sélectionnée.
- **Calendrier** : navigation par mois, jours avec livraisons planifiées.
- Bascule **aujourd'hui** / autre date ; bouton **Actualiser**.
- Carte par arrêt : séquence, statut, adresse, contenu, distance, créneau, ETA.
- **Contenu** : quantité + unité pour un produit ; **`multiple`** si plusieurs produits planifiés.
- Progression globale (% livrés).
- Accès à la livraison suivante (carte cliquable si accessible).

### 1.3 Carte (`/map`)

- Carte Leaflet : dépôt, arrêts, polyligne d'itinéraire.
- Position GPS du livreur (si autorisée).
- Clic sur un arrêt → ouverture de la livraison.

### 1.4 Parcours livraison (`/delivery/:id`)

Étapes successives pour un arrêt **en cours** :

| Étape | Fonctionnalité |
|-------|----------------|
| **Démarrer** | Vérification **géofence** (~200 m du point) ; passage en `in_progress` |
| **Photos** | Prise via caméra ou fichier ; hash anti-doublon ; nombre requis selon produits |
| **Déclaration** | Livraison **complète**, **partielle** ou **refusée** ; lignes par produit (accepté / refusé / motif) |
| **OTP** | Envoi SMS au **téléphone responsable** du point ; saisie code à 6 chiffres ; renvoi avec cooldown |
| **Confirmation** | Validation OTP ; génération **certificat** (`receiptId`) ; score fraude stub côté API (non exploité manager — phase 2) |

**Consultation** (arrêt déjà clôturé — livré, refusé, échoué) :

- Statut et libellé adapté (livré, partiel, refusé, échoué).
- Quantités **attendues** et **livrées** par produit.
- Message adapté si refusée (« livraison refusée ») ou annulée.

**Autres actions :**

- **Annuler** depuis les photos → retour à « à démarrer ».
- Arrêts **futurs** (date > aujourd'hui) : consultation seule.
- Arrêts **verrouillés** : message d'accès explicite.

### 1.5 Profil (`/profile`)

- Identité livreur (nom, téléphone).
- Historique du **jour** : statut par arrêt.
- Lien **certificat** JSON pour les livraisons confirmées.
- Déconnexion.

### 1.6 Mode hors ligne (PWA)

- **Service worker** + cache statique (installable).
- **IndexedDB** (Dexie) : cache tournée, file d'attente de synchronisation.
- Reprise automatique de la file au retour en ligne (`processSyncQueue`).
- Limites : certaines actions nécessitent le réseau (OTP, upload photos selon config).

### 1.7 Règles métier livreur

- Unités : palette, caisse, kg, colis, carton, plateau, sac, bidon, unité.
- Géofence confirmation OTP : ~100 m (assouplissable en dev — voir [`VALIDATIONS-TESTS.md`](../VALIDATIONS-TESTS.md)).
- Tournées multiples le même jour : **fusion côté chauffeur** en une liste (voir [`ameliorations-futures.md`](../ameliorations-futures.md)).

---

## 2. Dashboard Gestionnaire (`/manager`)

### 2.1 Authentification

- Login e-mail / mot de passe (`/manager/login`).
- Session cookie HttpOnly (~8 h).
- Compte démo : `manager@demo.fr` / `admin1234`.

### 2.2 Suivi livraisons

- Filtres : **date**, **statut** (à démarrer, en cours, OTP, livré, échoué).
- KPI : total, validées, en attente.
- Liste **groupée par tournée** (sections repliables).
- Actions par tournée : **Replanifier**, **Modifier**.
- Clic sur une livraison → **modale détail**.
- Bannière si **tâches en attente** → lien vers onglet Tâches.

**Modale détail livraison :**

- Identité, statut, commande, livreur, dépôt, fenêtre horaire.
- Quantités **attendues** et **livrées** (par produit).
- Table **déclaration livreur** (accepté / refusé / justification).
- **Photos** livreur (si Netlify Blobs actif).
- Lien **certificat** cliquable.
- Bouton **Modifier la tournée**.

### 2.3 Planifier une tournée

- Sélection **date** ; liste des tournées du jour.
- **Création** : livreur, dépôt (nom + adresse), créneau tournée, arrêts multiples.
- Par arrêt : **point du catalogue** Points de livraison (obligatoire), **produits catalogue** (qté + unité), réf. commande, créneau horaire, photos requises, instructions.
- **Édition** (modale) : modification des arrêts non livrés ; arrêts livrés en lecture seule.
- **Replanification** :
  - Depuis Suivi, Planifier ou Tâches.
  - Nouvelle tournée + clôture des arrêts non livrés de l'ancienne.
  - Templates API : replan tournée complète ou **reliquat partiel**.
  - **Annuler** replan : retour au bon onglet / date source.
- Après sauvegarde : rafraîchissement **Suivi** et alignement date **Planifier**.

### 2.4 Livreurs

- Création : nom, téléphone `+225`, PIN.
- Liste : nom, téléphone, statut (actif / suspendu).
- Édition inline ; toggle actif/inactif.
- Désactivation → tâches **réaffectation tournée** pour les tournées futures.

### 2.5 Points de livraison

- CRUD supermarchés / chantiers : nom, adresse, tél. **responsable OTP**, nom/e-mail responsable, lat/lng.
- Toggle actif / inactif.
- Adresses recommandées avec ville/pays (ex. Abidjan, Côte d'Ivoire).

### 2.6 Catalogue produits

- CRUD : libellé, unité, ordre d'affichage.
- Unités : palette, kg, colis, carton, caisse, plateau, sac, bidon, unité.
- Toggle actif / inactif.

### 2.7 Tâches

Génération automatique selon événements métier :

| Type | Déclencheur typique |
|------|---------------------|
| `delivery_confirmed` | Livraison validée OTP |
| `partial_delivery` | Écart de quantité / refus partiel |
| `missed_delivery` | Non effectuée / échouée |
| `delivery_cancelled` | Annulation livreur |
| `reassign_tour` | Livreur désactivé avec tournées futures |

Actions : **Voir livraison**, **Ouvrir tournée**, **Replanifier** (si éligible), **Marquer traitée**.

### 2.8 Achats chantier BTP (tenant `co-btp-pilote`, hors prod)

Circuit **EB → BC → tournée** et enveloppe **F01.1** (Contrôle de gestion). Couverture CDC Fadym : **F01–F07 et F09** dans TraceO ; **F08 et F10 hors périmètre**. Index : [`BTP-INDEX.md`](./BTP-INDEX.md) · synthèse : [`BTP-SYNTHESE-EXECUTIVE-DIRECTION.md`](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md).

| Onglet / capacité | Rôle |
|-------------------|------|
| **Achats chantier** | EB, validations DT/DAF/PDG, BC, exports SA |
| **Suivi chantier** | Enveloppe CdG (gel NIP), avenants DT/DAF, engagé / reste |
| WhatsApp (pont) | Intrant terrain — **F05 / F07**, pas une 3ᵉ appli |

Comptes pilote : CdG `cdg@btp-pilote.ci` · DT `dt@btp-pilote.ci` · DAF `daf@btp-pilote.ci` (mot de passe seed `admin1234`).

---

## 3. API & backend

### 3.1 Auth

| Route | Rôle |
|-------|------|
| `POST /auth/login-driver` | Login livreur |
| `POST /auth/refresh` | Refresh token livreur |
| `POST /auth/login-dashboard` | Login manager |
| `POST /auth/logout-dashboard` | Logout manager |
| `GET /auth/me` | Session manager |

### 3.2 Livreur

| Route | Rôle |
|-------|------|
| `GET /tours/today` | Tournée du jour |
| `GET /tours/by-date/:date` | Tournée à une date |
| `GET /tours/schedule` | Calendrier (jours avec livraisons) |
| `POST /tours/:id/reroute` | Recalcul itinéraire |
| `GET /deliveries/:id` | Détail + déclaration |
| `POST /deliveries/:id/start` | Démarrer |
| `POST /deliveries/:id/photo` | Upload photo |
| `GET /deliveries/:id/photos` | Liste photos |
| `POST /deliveries/:id/declare` | Déclaration quantités |
| `POST /deliveries/:id/cancel` | Annuler |
| `POST /deliveries/:id/send-otp` | Envoyer OTP SMS |
| `POST /deliveries/:id/confirm` | Confirmer OTP |
| `GET /certificates/:receiptId` | Certificat public |

### 3.3 Gestionnaire

| Route | Rôle |
|-------|------|
| `GET/POST /dashboard/tours` | Liste / création |
| `GET/PATCH /dashboard/tours/:id` | Détail / édition |
| `GET /dashboard/tours/:id/replan-template` | Template replan |
| `GET /dashboard/deliveries/:deliveryId/partial-replan-template` | Reliquat partiel |
| `GET /dashboard/deliveries` | Suivi filtré |
| `GET /dashboard/deliveries/:id` | Détail |
| `GET /dashboard/deliveries/:id/photos` | Photos |
| `GET /dashboard/photos/*` | Blob photo |
| `GET/POST/PATCH /dashboard/drivers` | Livreurs |
| `GET/POST/PATCH /dashboard/supermarkets` | Points |
| `GET/POST/PATCH /dashboard/products` | Produits |
| `GET /dashboard/manager-tasks` | Tâches |
| `POST /dashboard/manager-tasks/:id/resolve` | Clôturer tâche |

### 3.4 Admin (dev / E2E)

| Route | Rôle |
|-------|------|
| `POST /admin/reset` | Vide la base (confirmation obligatoire) |
| `POST /admin/seed` | Recharge les données démo |

### 3.5 Notifications

- **SMS OTP** : vers le téléphone responsable du point (`SMS_PROVIDER=mock|textbee|twilio` — voir [`VALIDATIONS-TESTS.md`](../VALIDATIONS-TESTS.md) §3).
- **E-mail** : notification managers à la confirmation (`EMAIL_PROVIDER=mock`, Mailpit local, ou Brevo SMTP — voir [`VALIDATIONS-TESTS.md`](../VALIDATIONS-TESTS.md) §7).

---

## 4. Qualité & exploitation

| Outil | Rôle |
|-------|------|
| `npm run regression` | Build + lint + tests unitaires + E2E (26 tests) |
| `e2e/INVARIANTS.md` | Invariants métier verrouillés (I01–I72, dont F01 I66–I72) |
| `VALIDATIONS-TESTS.md` | Assouplissements dev (géofence, OTP mock…) |
| Hook `pre-push` | Lance la non-régression avant push |

---

## 5. Hors scope ou partiel

### Priorité pilote (à combler)

| Zone | Statut |
|------|--------|
| Déblocage **resend OTP** / **reopen** livraison | Absent |
| Géocodage automatique points | Absent |
| Validation conflits créneaux / doublons arrêts | Partiel |
| Garde 409 suspension livreur en livraison active | Absent |

### Reporté phase 2 (volontairement hors pilote CI)

| Zone | Statut |
|------|--------|
| KPI / filtre **fraude** manager | Absent — non prioritaire tant que volume faible |
| `GET /dashboard/analytics` (scores fraude) | Absent |
| Scoring fraude terrain (photo GPS, OTP rapide…) | Stub fixe en dev |

Détail : [`MANAGER-PARITY-5175.md`](./MANAGER-PARITY-5175.md).

**Extensions** présentes dans ce dépôt mais pas dans la référence : replan avancé, suivi groupé par tournée, quantités livrées calculées, photos manager, champs dépôt par tournée.

---

## 6. Comptes & données démo

| Rôle | Identifiant | Secret |
|------|-------------|--------|
| Livreur (principal) | `+2250701234567` | PIN `1234` |
| Livreur (secondaire) | `+2250102030405` | PIN `1234` |
| Manager | `manager@demo.fr` | `admin1234` |
| CdG (pilote BTP) | `cdg@btp-pilote.ci` | `admin1234` |
| DT (pilote BTP) | `dt@btp-pilote.ci` | `admin1234` |
| DAF (pilote BTP) | `daf@btp-pilote.ci` | `admin1234` |
| OTP livraison (dev) | — | `123456` |

Seed : `POST /api/admin/seed` après reset. Tournée démo du jour avec arrêts à Abidjan.

---

## 7. Documents connexes

| Fichier | Sujet |
|---------|--------|
| [`README.md`](../README.md) | Installation, déploiement, dépannage |
| [`TELEPHONES-CI.md`](./TELEPHONES-CI.md) | Format +225, placeholders UI |
| [`MANAGER-PARITY-5175.md`](./MANAGER-PARITY-5175.md) | Écarts vs dashboard référence |
| [`e2e/INVARIANTS.md`](../e2e/INVARIANTS.md) | Couverture tests |
| [`VALIDATIONS-TESTS.md`](../VALIDATIONS-TESTS.md) | Modes test / bypass |
| [`ameliorations-futures.md`](../ameliorations-futures.md) | Évolutions reportées, sécurité |
| [`BTP-INDEX.md`](./BTP-INDEX.md) | **Table des matières** BTP · CDC F01–F07, F09 (hors F08, F10) |
| [`BTP-SYNTHESE-EXECUTIVE-DIRECTION.md`](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) | Synthèse exécutive direction |

---

*Document maintenu manuellement — mettre à jour lors d'ajouts fonctionnels majeurs.*
