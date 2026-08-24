# Validations mises de côté pour les tests

Ce document recense les contrôles métier normalement actifs en production et la façon de les désactiver ou assouplir **uniquement pour les tests**.

Fichier de configuration prêt à l’emploi : [`config/validations-tests.env`](config/validations-tests.env).

---

## 1. Géofencing — distance au point de livraison

| Étape | Règle production | Où c’est appliqué |
|-------|------------------|-------------------|
| Démarrage livraison | ≤ **200 m** du point | PWA client, API mock, API Livraison |
| Confirmation OTP | ≤ **100 m** du point | PWA client, API mock, API Livraison |
| Photo vs point | pénalité fraude si > **200 m** | API Livraison uniquement |

### Contournement

| Composant | Variable | Effet |
|-----------|----------|-------|
| **PWA Livreur** | `VITE_GEOFENCE_BYPASS=true` | Ignore les 200 m et 100 m côté navigateur |
| **PWA Livreur** | `VITE_E2E=true` | Idem + GPS simulé (inclus dans les tests Playwright) |
| **API mock** (`server/`) | `GEOFENCE_BYPASS=true` | Ignore 200 m / 100 m côté serveur mock |
| **API Livraison** (Docker) | `GEOFENCE_DISABLED=true` | Ignore tout géofencing serveur |
| **API Livraison** (Docker) | `GEOFENCE_RADIUS_M=5000` | Rayon élargi si `GEOFENCE_DISABLED=false` |

**Activation rapide (dev actuel avec API Livraison) :**

```bash
# Dans .env.development de la PWA
VITE_GEOFENCE_BYPASS=true

# Puis redémarrer le frontend (npm run dev)

# Pour l'API Livraison (Docker), depuis le dossier Livraison :
GEOFENCE_DISABLED=true docker compose up -d api workers
```

Code : `src/lib/testBypass.ts`, `src/pages/DeliveryPage.tsx`, `server/testBypass.ts`, `server/routes/deliveries.ts`.

---

## 2. GPS navigateur — précision requise

| Règle production | Où |
|------------------|-----|
| Bouton « Démarrer » désactivé si précision GPS **> 100 m** | `src/hooks/useGps.ts` |

### Contournement

| Variable | Effet |
|----------|-------|
| `VITE_GEOFENCE_BYPASS=true` | Accepte une précision GPS faible |
| `VITE_E2E=true` | Position fixe (48.892, 2.412), précision 5 m |

---

## 3. OTP SMS — providers et contournements

| Règle production | Où |
|------------------|-----|
| Code OTP aléatoire (6 chiffres) | `server/config/production.ts` (`resolveOtpCode`) |
| SMS réel vers le **téléphone responsable** du point (+225) | `server/services/sms.ts` → `POST /deliveries/:id/send-otp` |
| Livraison bloquée si SMS échoue | `SMS_OTP_FAIL_OPEN=false` (défaut prod) |
| Code fixe `123456` en dev | `OTP_CODE` + `allowTestBypass()` |

### Trois modes SMS (`SMS_PROVIDER`)

> **Guide pas à pas (Netlify, Textbee, numéros responsables) :** [`docs/CONFIGURATION-PILOTE.md`](docs/CONFIGURATION-PILOTE.md)

| Mode | Usage | Configuration |
|------|--------|----------------|
| **mock** | Dev, E2E, `npm run regression` | `SMS_PROVIDER=mock` — log console, pas d’envoi |
| **textbee** | Pilote CI (Android + SIM locale) | `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID` |
| **twilio** | Prod / volume | `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_NUMBER` |

> **Africa’s Talking** et autres APIs : non branchées nativement — utiliser Twilio ou un relais SMTP/API dédié si besoin.

### mock (défaut dev / tests)

```env
SMS_PROVIDER=mock
OTP_CODE=123456
SMS_OTP_FAIL_OPEN=true
```

Le code est loggé ; `devOtpCode` est renvoyé à l’API si `allowTestBypass()` (hors production).

### Textbee (pilote Côte d’Ivoire)

1. Installer [Textbee](https://textbee.dev) sur un **Android** avec SIM Orange / MTN / Moov.
2. Récupérer **API key** + **device ID** dans l’app.
3. Variables :

```env
SMS_PROVIDER=textbee
TEXTBEE_API_KEY=votre_cle
TEXTBEE_DEVICE_ID=votre_device_id
TEXTBEE_API_BASE=https://api.textbee.dev/api/v1
OTP_CODE=
SMS_OTP_FAIL_OPEN=false
```

Le téléphone Android doit rester connecté (internet + app ouverte en arrière-plan).

### Twilio (prod)

```env
SMS_PROVIDER=twilio
TWILIO_SID=ACxxxxxxxx
TWILIO_TOKEN=xxxxxxxx
TWILIO_NUMBER=+225XXXXXXXX
SMS_OTP_FAIL_OPEN=false
```

Alias acceptés : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

### Contournement si SMS indisponible (tests uniquement)

| Variable | Effet |
|----------|-------|
| `SMS_OTP_FAIL_OPEN=true` | OTP conservé + `devOtpCode` même si Textbee/Twilio échoue |
| `SMS_PROVIDER=mock` | Jamais d’appel réseau SMS |
| Playwright `E2E_SERVER_ENV` | `SMS_PROVIDER=mock` + `SMS_OTP_FAIL_OPEN=true` |

Sans `SMS_OTP_FAIL_OPEN`, un échec SMS renvoie **503** et efface l’OTP en base.

Code OTP de démo documenté : **123456** (dev uniquement).

Voir aussi : [`.env.example`](.env.example), [`docs/TELEPHONES-CI.md`](docs/TELEPHONES-CI.md).

---

## 4. Photos de livraison

| Règle production | Où |
|------------------|-----|
| Caméra obligatoire (pas de galerie) | `CameraCapture.tsx` |
| Détection doublon (hash perceptuel) | PWA + API mock + API Livraison |
| Nombre de photos = **une par unité / produit** déclaré | `DeliveryPage.tsx`, API Livraison (`requiredPhotoCount`) |
| Minimum absolu : **1 photo** avant envoi OTP | API Livraison |

### Contournement

| Composant | Variable | Effet |
|-----------|----------|-------|
| **PWA Livreur** | `VITE_PHOTOS_BYPASS=true` | **1 photo suffit** côté UI (cible photos, bouton OTP) |
| **API Livraison** | `PHOTOS_MIN_ONLY=true` | **Obligatoire** pour que `send-otp` / confirmation n’exigent qu’**1 photo** |

Les deux doivent être actifs ensemble en test avec l’API Livraison. Sans `PHOTOS_MIN_ONLY` sur l’API, l’écran OTP renverra « Photos insuffisantes : 1/N ».

**Important :** la variable seule ne suffit pas — l’image Docker doit inclure le code qui lit `PHOTOS_MIN_ONLY` (fichier `src/config/index.js`). Si l’erreur persiste alors que `docker inspect livraison-api` montre `PHOTOS_MIN_ONLY=true`, **reconstruire l’API** :

```bash
cd /chemin/vers/Livraison
PHOTOS_MIN_ONLY=true GEOFENCE_DISABLED=true docker compose up -d --build api
```

Code : `src/lib/photoRequirements.ts` (`effectivePhotoTarget`), `src/pages/DeliveryPage.tsx`, `Livraison/src/utils/deliveryDeclaration.js`.

---

## 5. Déclaration de quantités

| Règle production | Où |
|------------------|-----|
| Chaque produit doit avoir une quantité **acceptée** ou **refusée** avant l’OTP | PWA (`declarationValidation.ts`), API Livraison |
| Livraison complète / partielle / refus total | `PartialDeclaration.tsx`, `DeliveryPage.tsx` |

### Contournement

Aucun contournement global : la déclaration reste obligatoire. En mode test, une livraison **complète** (quantités attendues = acceptées) peut être enregistrée en un clic via le bouton « Enregistrer la déclaration » sans modifier les champs.

---

## 6. Connexion réseau

| Règle production | Où |
|------------------|-----|
| Confirmation finale **en ligne uniquement** | `DeliveryPage.tsx` |
| File d’attente offline pour start / OTP / photos | `sync.ts` |

### Contournement

| Variable | Effet |
|----------|-------|
| Mode mock | Confirmation offline possible |
| `VITE_E2E=true` | Tests toujours en ligne |

---

## 6. Authentification livreur

| Règle production | Où |
|------------------|-----|
| Format téléphone `+225…` (10 chiffres) | `LoginPage.tsx`, `src/lib/phone.ts`, manager Livreurs/Points |
| PIN à 4 chiffres | API |

### Contournement

| Composant | Effet |
|-----------|-------|
| Mode mock | PIN `1234`, tout numéro valide au format |
| API mock | `DRIVER_PIN=1234` |

Identifiants de test documentés dans le README.

---

## 7. E-mail — notification bon de livraison

| Règle production | Où |
|------------------|-----|
| E-mail au(x) manager(s) après confirmation OTP | `server/services/deliveryNotifications.ts` |
| Provider `mock` ou `smtp` (nodemailer) | `server/config/email.ts`, `server/services/email.ts` |

### Trois modes recommandés

> **Guide pas à pas (Brevo, Mailpit, e-mails manager) :** [`docs/CONFIGURATION-PILOTE.md`](docs/CONFIGURATION-PILOTE.md)

| Mode | Usage | Configuration |
|------|--------|----------------|
| **mock** | Dev, E2E, `npm run regression` | `EMAIL_PROVIDER=mock` — contenu loggé en console |
| **Mailpit** | Tests manuels locaux (boîte mail locale) | SMTP `localhost:1025` |
| **Brevo** | Pilote CI / production | SMTP `smtp-relay.brevo.com:587` |

> **Éviter Mailtrap** pour les tests automatisés : quotas stricts (« too many emails per second ») qui bloquent `POST /confirm` en E2E. Playwright force déjà `EMAIL_PROVIDER=mock` (`playwright.config.ts`).

### Mailpit (local — alternative à Mailtrap)

```bash
docker run -d --name mailpit -p 8025:8025 -p 1025:1025 axllent/mailpit
```

Interface web : http://localhost:8025

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=livraisons@demo.fr
PUBLIC_BASE_URL=http://localhost:8888
```

Relancer `netlify dev` après changement. Les mails de confirmation apparaissent dans Mailpit, pas dans une vraie boîte.

### Brevo (pilote / prod)

1. Créer un compte sur [brevo.com](https://www.brevo.com).
2. **Paramètres → SMTP & API → Clé SMTP** (login + clé).
3. Vérifier le domaine d’envoi (SPF/DKIM) pour `EMAIL_FROM`.
4. Variables (Netlify ou `.env`) :

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=ton-login-brevo
SMTP_PASS=ta-cle-smtp-brevo
EMAIL_FROM=livraisons@ton-domaine.com
PUBLIC_BASE_URL=https://ton-site.netlify.app
```

Quota gratuit : ~300 e-mails/jour — suffisant pour un pilote livreur.

### Contournement tests automatisés

| Variable | Effet |
|----------|-------|
| `EMAIL_PROVIDER=mock` | Aucun SMTP ; pas de rate limit |
| Playwright `E2E_SERVER_ENV` | `EMAIL_PROVIDER=mock` injecté au `netlify dev` des E2E |

Voir aussi : [`.env.example`](.env.example), [`config/validations-tests.env`](config/validations-tests.env).

---

## 8. Fraude / scoring

> **Pilote CI** : la surveillance fraude manager (KPI, filtres, analytics) est **hors scope** — voir [`docs/MANAGER-PARITY-5175.md`](docs/MANAGER-PARITY-5175.md) § phase 2. Le stub ci-dessous suffit pour les tests E2E.

| Règle production | Où |
|------------------|-----|
| Score fraude calculé (photo GPS, doublons, etc.) | API Livraison |
| Photo prise loin du point → pénalité | API Livraison |

### Contournement (pwa-livreur)

| Variable / mode | Effet |
|-----------------|-------|
| `GEOFENCE_DISABLED=true` | Réduit les signaux liés au GPS |
| API mock / Express locale | Score fixe bas (`fraudScore: 12`, `fraudLevel: low`) — intentionnel pour le pilote |

---

## 9. Récapitulatif — activer le mode test complet

### PWA seule (API Livraison sur :3001)

```env
# .env.development
VITE_API_URL=/api/v1
VITE_API_BACKEND=livraison
VITE_GEOFENCE_BYPASS=true
VITE_PHOTOS_BYPASS=true
```

```bash
# API Livraison
GEOFENCE_DISABLED=true PHOTOS_MIN_ONLY=true SMS_OTP_FAIL_OPEN=true docker compose up -d api workers
```

### PWA + API mock (tests E2E / sans Docker)

```bash
EMAIL_PROVIDER=mock SMS_PROVIDER=mock SMS_OTP_FAIL_OPEN=true GEOFENCE_BYPASS=true OTP_CODE=123456 VITE_E2E=true npm run test:e2e
```

(`EMAIL_PROVIDER`, `SMS_PROVIDER` et `SMS_OTP_FAIL_OPEN` sont aussi dans `config/validations-tests.env` et `playwright.config.ts`.)

---

## Réactiver les validations (pré-production)

1. `VITE_GEOFENCE_BYPASS=false`, `VITE_PHOTOS_BYPASS=false` et retirer `VITE_E2E`
2. `GEOFENCE_BYPASS=false` sur l’API mock
3. `GEOFENCE_DISABLED=false`, `PHOTOS_MIN_ONLY=false`, `SMS_OTP_FAIL_OPEN=false` sur l’API Livraison
4. `GEOFENCE_RADIUS_M=200` (valeur par défaut métier)
