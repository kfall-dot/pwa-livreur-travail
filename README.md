# PWA Livreur — Traçabilité & Optimisation de Route

Progressive Web App installable pour livreurs B2B : tournées optimisées, déclaration des quantités (accepté / refusé), preuves photo géolocalisées, validation OTP SMS, mode hors ligne.

> **Synthèse fonctionnelle complète** : [`docs/FONCTIONNALITES.md`](docs/FONCTIONNALITES.md)

> **Documentation BTP (Achats chantier)** — table des matières : [`docs/BTP-INDEX.md`](docs/BTP-INDEX.md) · synthèse direction (PDF) : `docs/TraceO_BTP-Synthese-Executive-Direction.pdf`

> **PWA livreur officielle** — ce dépôt remplace `Livraison/apps/driver-pwa` (port 5174). Branchez-le sur l’API Livraison (`:3001`) pour le parcours métier complet.

## Architecture (livreur + gestionnaire)

Ce dépôt contient la **PWA livreur** et le **dashboard gestionnaire embarqué** (`/manager`), sur une API Express + Postgres commune.

```
┌─────────────────────┐     ┌─────────────────────┐
│  PWA Livreur        │     │  Dashboard          │
│  (ce dépôt)         │     │  Gestionnaire       │
│  :5173 en dev       │     │  :5175 en dev       │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
              ┌─────────────────┐
              │  API (Fastify)  │
              │  :3000 / :3001  │
              │  PostgreSQL     │
              └─────────────────┘
```

| Application | Dépôt / dossier | URL dev | Authentification |
|-------------|-----------------|---------|------------------|
| **PWA livreur** | `pwa-livreur` (ici) | http://localhost:5173 | Téléphone + PIN 4 chiffres |
| **Dashboard gestionnaire** | `Livraison/apps/dashboard-web` | http://localhost:5175 | Email + mot de passe |
| **API** | `Livraison` (oeufs-api) | http://localhost:3000 | JWT Bearer |

> Chemin habituel du monorepo complet : `~/Downloads/mnt/agents/output/Livraison`  
> Documentation détaillée gestionnaire : `Livraison/docs/ETAPES.md` §8–9.

## Stack


| Couche      | Technologie                                           |
| ----------- | ----------------------------------------------------- |
| Frontend    | React 19, TypeScript, Vite 8, PWA, Dexie, Leaflet     |
| Backend     | Express 5, JWT, Multer                                |
| Tests       | Playwright                                            |
| Déploiement | Docker, Vercel (static), Netlify (static + functions) |


## Démarrage rapide

```bash
npm install
npm run dev:all    # Frontend :5173 + API mock :3002 (évite conflit avec oeufs-api :3000)
```

Ouvrir [http://localhost:5173](http://localhost:5173)


| Identifiant   | Valeur                                               |
| ------------- | ---------------------------------------------------- |
| Téléphone     | `+2250701234567` (ou `0701234567`) — PIN `1234` |
| PIN           | `1234`                                               |
| OTP livraison | `123456`                                             |


Le frontend utilise `VITE_API_URL=/api` (proxy Vite → backend).

## Dashboard gestionnaire

Interface web réservée aux **managers** et **admins** : planification des tournées, suivi des livraisons, tâches d’escalade, référentiels.

### Démarrer le dashboard (monorepo Livraison)

Prérequis : API + Postgres en marche (`docker compose up -d` dans le dossier `Livraison`).

```bash
cd /chemin/vers/Livraison/apps/dashboard-web
cp .env.example .env
npm install
npm run dev
```

Ouvrir http://localhost:5175

### Compte démo gestionnaire

| Champ | Valeur |
|-------|--------|
| Email | `manager@demo.fr` |
| Mot de passe | `admin1234` |

*(Compte créé par le seed `POST /api/admin/seed`.)*

### Fonctionnalités gestionnaire

| Onglet | Rôle |
|--------|------|
| **Vue d’ensemble** | Livraisons du jour, filtres statut, détail livraison (KPI fraude : phase 2) |
| **Planifier une tournée** | Date, livreur, arrêts (supermarché, palettes, créneaux) → visible dans la PWA livreur le jour J |
| **Livreurs** | CRUD comptes livreurs (téléphone, PIN) |
| **Points de livraison** | Supermarchés / chantiers, téléphone **responsable** (destinataire OTP SMS) |
| **Produits** | Catalogue pour déclarations partielles / refus |
| **Tâches manager** | Escalade automatique si livraison non effectuée, annulée par le livreur, refus total ou écart de quantité |

### Lien livreur ↔ gestionnaire

1. Le **gestionnaire** crée la tournée et renseigne le `managerPhone` de chaque point.
2. Le **livreur** démarre la livraison, prend les photos, **déclare les quantités** (livraison complète, partielle ou refus), puis **« Envoyer code au responsable »**.
3. L’API envoie un **SMS OTP** au responsable du point (pas au gestionnaire sauf si même numéro).
4. En cas d’**échec**, **refus**, **acceptation partielle** ou **annulation par le livreur**, une **tâche manager** est créée (onglet Tâches).
5. Le gestionnaire peut **renvoyer l’OTP** ou **rouvrir** une livraison depuis le dashboard.

### API gestionnaire (backend Livraison)

Routes protégées rôle `manager` ou `admin` :

| Endpoint | Usage |
|----------|--------|
| `POST /api/v1/auth/login-dashboard` | Connexion email / mot de passe |
| `GET /api/v1/dashboard/deliveries` | Liste livraisons filtrée |
| `GET /api/v1/dashboard/analytics` | Statistiques |
| `POST /api/v1/dashboard/tours` | Créer une tournée |
| `GET /api/v1/dashboard/drivers` | Liste livreurs |
| `GET /api/v1/dashboard/supermarkets` | Points de livraison |
| `GET /api/v1/dashboard/manager-tasks` | Tâches en attente |
| `POST /api/v1/dashboard/manager-tasks/:id/resolve` | Clôturer une tâche |

> L’API mock de **ce dépôt** (`server/`) ne couvre que le parcours livreur. Pour le gestionnaire, utilisez l’API **Livraison** (Fastify + PostgreSQL).

## Scripts


| Commande               | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | Frontend seul (mock navigateur si pas de `VITE_API_URL`) |
| `npm run dev:server`   | API Express seule                                        |
| `npm run dev:all`      | Frontend + API                                           |
| `npm run build`        | Build PWA                                                |
| `npm run build:server` | Compile le serveur → `dist-server/`                      |
| `npm start`            | Production : API + fichiers statiques `dist/`            |
| `npm run test:e2e`     | Tests Playwright (démarre API + frontend)                |
| `npm run verify`       | **Build + E2E + contrôle API Livraison** (à lancer avant livraison) |


## API REST

Base : `http://localhost:3002/api` (port **3002** — le port 3000 est souvent pris par `oeufs-api` sur cette machine)


| Endpoint                    | Méthode                             |
| --------------------------- | ----------------------------------- |
| `/auth/login-driver`        | POST                                |
| `/auth/refresh`             | POST                                |
| `/tours/today`              | GET                                 |
| `/tours/{id}/reroute`       | POST                                |
| `/deliveries/{id}`          | GET (détail + lignes déclaration)   |
| `/deliveries/{id}/start`    | POST                                |
| `/deliveries/{id}/photo`    | POST multipart                      |
| `/deliveries/{id}/declare`  | POST (quantités acceptées / refusées)|
| `/deliveries/{id}/send-otp` | POST                                |
| `/deliveries/{id}/confirm`  | POST                                |
| `/certificates/{receiptId}` | GET (public)                        |
| `/health`                   | GET                                 |
| `/admin/reset`              | POST (réinitialise la tournée démo) |


Variables : voir `.env.example`

## Tests E2E

```bash
npx playwright install chromium
npm run test:e2e
```

Les tests démarrent automatiquement l'API (`GEOFENCE_BYPASS=true`) et le frontend (`VITE_E2E=true` pour simuler GPS + photos).

## Déploiement

### Docker (recommandé — full stack)

```bash
docker build -t pwa-livreur .
docker run -p 3002:3002 -e JWT_SECRET=secret -e PORT=3002 pwa-livreur
```

Application livreur + API mock sur le port **3002** (le dashboard gestionnaire reste dans `Livraison/apps/dashboard-web`).

### Vercel (frontend uniquement)

```bash
# Déployer dist/ — configurer VITE_API_URL vers votre API hébergée
vercel
```

`vercel.json` : SPA avec fallback `index.html`.

### Netlify (frontend + API serverless)

> **Configuration pilote (SMS Textbee, e-mail Brevo, variables Netlify) :** [`docs/CONFIGURATION-PILOTE.md`](docs/CONFIGURATION-PILOTE.md)  
> Modèle de variables : [`config/pilot-netlify.env.example`](config/pilot-netlify.env.example)

1. Build : `npm run build && npm run build:server`
2. Publish : `dist`
3. Functions : `netlify/functions`
4. Variables : `JWT_SECRET`, `PUBLIC_BASE_URL`, `EMAIL_PROVIDER` + SMTP, `SMS_PROVIDER` + Textbee/Twilio — voir le guide pilote

Les requêtes `/api/*` sont routées vers la function Express.

### Railway / Render

Utiliser le `Dockerfile` ou :

- Build : `npm run build && npm run build:server`
- Start : `npm start`
- Port : `3002` (ou `PORT` en variable d’environnement)

## Livreurs — problèmes fréquents

| Symptôme | Cause | Solution |
|----------|-------|----------|
| `ENOTFOUND postgres` à la connexion | Frontend pointe vers `oeufs-api` (:3000) | Utiliser `livraison-api` (:3001) — voir `.env.development` |
| « Téléphone invalide » / 400 | Numéro hors format | `+225` + 10 chiffres (ex. `+2250701234567` ou `0701234567`) |
| Jean Livreur absent du planning | Compte absent de la base Livraison | `docker exec -i livraison-postgres psql -U livraison -d livraison < scripts/seed-jean-livreur.sql` |
| « Identifiants invalides » | PIN incorrect ou livreur inactif | PIN démo `1234` ; vérifier dans le dashboard **Livreurs** |
| Liste livreurs vide (gestionnaire) | API hors ligne ou mauvais port | `curl http://localhost:3001/health` puis reconnecter le dashboard |
| Livreur créé mais ne se connecte pas | Téléphone mal formaté à la création | Saisir `+2250701234567` ou `0701234567` (10 chiffres locaux) |

Les livreurs sont gérés dans le dashboard gestionnaire (**Livreurs** → ajouter / modifier / désactiver). Un livreur **inactif** ne peut plus se connecter à la PWA.

## Dépannage

### `getaddrinfo ENOTFOUND postgres`

Cette erreur vient du conteneur **`oeufs-api`** sur le port **3000** (Postgres arrêté). **N'utilisez pas le port 3000** pour les livreurs.

**Solution** — API Livraison sur le port **3001** :

```bash
# Vérifier que livraison-api tourne
docker ps | grep livraison-api
curl http://localhost:3001/health

npm run dev:all   # ou npm run dev (proxy → :3001)
```

Connexion livreur : `+2250701234567` / PIN `1234` (format **+225** + 10 chiffres — pas de `+33…`).

**Mode mock local** (sans Postgres) : commenter `VITE_API_URL` dans `.env.development`, lancer `npm run dev:server` sur le port 3002.

## Parcours livreur

1. **Login** — téléphone + PIN
2. **Tableau de bord** — tournée du jour, progression
3. **Carte** — itinéraire, marqueurs, livraison suivante
4. **Livraison** — géofencing → photos caméra → déclaration quantités → OTP → confirmation + certificat
5. **Profil** — historique, certificats, déconnexion

