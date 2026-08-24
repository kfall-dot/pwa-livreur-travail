# Configuration pilote — SMS, e-mail, Netlify

Guide pas à pas pour recevoir de **vrais SMS OTP** et de **vrais e-mails** sur le pilote Côte d’Ivoire.

**Site actuel :** https://pwa-livreur.netlify.app  
**Modèle de variables :** [`config/pilot-netlify.env.example`](../config/pilot-netlify.env.example)

> **« Site not found » sur Netlify** : le projet existait mais aucun déploiement n’était publié en **production** (`published_deploy` vide). Seuls des *deploy previews* (`netlify deploy` sans `--prod`) étaient actifs. Il faut lancer `npx netlify deploy --prod` pour que `https://<nom>.netlify.app` réponde.

> **API en erreur (`NETLIFY_DB_URL` / base non configurée)** : sur les Functions en mode compatibilité Lambda, Netlify n’injecte pas toujours la chaîne de connexion automatiquement. Copiez la **connection string lecture/écriture** depuis [Database → branche production](https://app.netlify.com/projects/pwa-livreur/database), ajoutez-la comme variable secrète `NETLIFY_DB_URL` (scope *All*), puis redéployez. Ne commitez jamais cette URL dans le dépôt.

---

## 1. Comprendre qui reçoit quoi

| Événement | Canal | Destinataire | Quand |
|-----------|-------|--------------|-------|
| Livreur clique « Envoyer code au responsable » | **SMS** | `contactPhone` de l’**arrêt** (point de livraison) | Avant confirmation |
| Livreur valide l’OTP + GPS | **E-mail** | Adresse du **compte manager** en base | Après confirmation |

**Ce n’est pas :**

- le téléphone du **livreur** (sauf si vous l’avez mis comme contact du point) ;
- votre e-mail personnel (sauf si vous avez créé un manager avec cette adresse).

### Exemple démo (seed)

| Rôle | Valeur |
|------|--------|
| Livreur Kouassi | `+2250701234567` / PIN `1234` |
| Contact OTP (arrêt Abidjan Centre) | `+2250102030405` (téléphone du **point catalogue**) |
| Manager (e-mail bon de livraison) | `manager@demo.fr` |

Pour un test réel : **mettez votre numéro** sur le **point de livraison** (onglet Points de livraison), puis planifiez un arrêt depuis ce point. Le contact OTP vient du catalogue. Créez aussi un manager avec votre e-mail.

---

## 2. Pourquoi rien n’arrive aujourd’hui

Sans variables explicites, l’application utilise le mode **mock** :

| Variable | Défaut | Effet |
|----------|--------|-------|
| `SMS_PROVIDER` | `mock` | SMS loggés côté serveur, **pas envoyés** |
| `EMAIL_PROVIDER` | `mock` | E-mail loggé côté serveur, **pas envoyé** |

Sur Netlify (juin 2026), seule `NODE_VERSION=20` était configurée → **aucun envoi réel**.

---

## 3. Les trois environnements

| Environnement | Usage | SMS / e-mail |
|---------------|--------|--------------|
| **Local `npm run dev:local`** | Développement quotidien (sans CLI Netlify) | `.env.development` + `NETLIFY_DB_URL` Neon |
| **Local `npm run netlify:dev`** | Dev avec Functions/Blobs (E2E) | `.env` à la racine (voir §4) |
| **Netlify production** | Pilote terrain | Variables dans le dashboard Netlify (voir §5) |
| **Tests automatisés** | `npm run regression` | Toujours `mock` (ne pas changer) |

---

## 4. Configuration locale (test manuel)

### 4.1 Fichier `.env`

```bash
cp .env.example .env
```

Éditez `.env` (fichier **gitignoré**, ne pas committer).

### 4.2 Scénario A — tout en mock (rapide)

```env
SMS_PROVIDER=mock
EMAIL_PROVIDER=mock
OTP_CODE=123456
SMS_OTP_FAIL_OPEN=true
JWT_SECRET=dev-local-secret-minimum-32-chars!!
```

Lancez :

```bash
# Quotidien (recommandé — pas de netlify:dev)
# Prérequis : NETLIFY_DB_URL dans .env.development (Neon connection string)
npm run dev:local
# → http://localhost:5173

# Avec Functions / Blobs Netlify (E2E)
npm run netlify:dev
# → http://localhost:8888
```

Ouvrez l’URL indiquée — le code OTP **`123456`** s’affiche à l’écran (mode dev).

### 4.3 Scénario B — e-mail réel local (Mailpit)

```bash
docker run -d --name mailpit -p 8025:8025 -p 1025:1025 axllent/mailpit
```

Dans `.env` :

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=livraisons@demo.fr
PUBLIC_BASE_URL=http://localhost:8888

SMS_PROVIDER=mock
OTP_CODE=123456
```

Interface des mails reçus : http://localhost:8025

### 4.4 Scénario C — SMS réel local (Textbee)

Prérequis : téléphone Android + SIM CI + app [Textbee](https://textbee.dev).

```env
SMS_PROVIDER=textbee
TEXTBEE_API_KEY=votre_cle
TEXTBEE_DEVICE_ID=votre_device_id
TEXTBEE_API_BASE=https://api.textbee.dev/api/v1
SMS_OTP_FAIL_OPEN=false
OTP_CODE=123456
```

Relancez `npm run netlify:dev`. Vérifiez que le **contact de l’arrêt** est votre numéro `+225…`.

---

## 5. Configuration Netlify (pilote production)

### 5.1 Accès

1. https://app.netlify.com/projects/pwa-livreur  
2. **Site configuration → Environment variables**  
3. Ajoutez les variables (scope **Production** au minimum)  
4. **Deploys → Trigger deploy → Deploy site** (obligatoire après changement)

### 5.2 Variables obligatoires (toute prod)

| Variable | Exemple | Notes |
|----------|---------|-------|
| `JWT_SECRET` | `openssl rand -base64 48` | Min. 32 caractères aléatoires |
| `NETLIFY_DB_URL` | *(depuis le dashboard Database)* | **Lecture/écriture** — voir §8 si l’API plante |
| `PUBLIC_BASE_URL` | `https://pwa-livreur.netlify.app` | Liens dans les e-mails |
| `EMAIL_FROM` | `livraisons@votre-domaine.com` | Doit être autorisé chez Brevo |

> La base Postgres est fournie par **Netlify Database** (extension du site). Pas de `DATABASE_URL` manuelle en général.

### 5.3 E-mail réel — Brevo (recommandé pilote)

1. Créer un compte sur https://www.brevo.com  
2. **Paramètres → SMTP & API → Clé SMTP**  
   - Noter le **login SMTP** (souvent votre e-mail Brevo)  
   - Générer une **clé SMTP** (mot de passe)  
3. **Expéditeurs** : ajouter et vérifier `EMAIL_FROM` (SPF/DKIM si domaine perso)  
4. Variables Netlify :

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-login-brevo
SMTP_PASS=votre-cle-smtp-brevo
EMAIL_FROM=livraisons@votre-domaine.com
PUBLIC_BASE_URL=https://pwa-livreur.netlify.app
```

**Quota gratuit :** ~300 e-mails/jour.

### 5.4 SMS réel — Textbee (recommandé CI)

1. Installer l’app Textbee sur un **Android** avec SIM **Orange / MTN / Moov**  
2. Créer un compte sur https://textbee.dev  
3. Dans l’app : lier l’appareil, copier **API Key** et **Device ID**  
4. Garder le téléphone **connecté** (internet + app en arrière-plan)  
5. Variables Netlify :

```env
SMS_PROVIDER=textbee
TEXTBEE_API_KEY=...
TEXTBEE_DEVICE_ID=...
TEXTBEE_API_BASE=https://api.textbee.dev/api/v1
SMS_OTP_FAIL_OPEN=false
```

**Ne pas définir `OTP_CODE` en production** — le code est généré aléatoirement.

### 5.5 SMS alternatif — Twilio

Si Textbee n’est pas disponible :

```env
SMS_PROVIDER=twilio
TWILIO_SID=ACxxxxxxxx
TWILIO_TOKEN=xxxxxxxx
TWILIO_NUMBER=+225XXXXXXXX
SMS_OTP_FAIL_OPEN=false
```

Alias acceptés : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

### 5.6 CLI Netlify (optionnel)

```bash
npx netlify login
npx netlify link   # si pas déjà lié

# Exemple (remplacez les valeurs)
npx netlify env:set JWT_SECRET "$(openssl rand -base64 48)" --context production
npx netlify env:set EMAIL_PROVIDER smtp --context production
npx netlify env:set SMS_PROVIDER textbee --context production
# … puis les autres variables une par une

npx netlify deploy --prod
```

---

## 6. Configuration des données (indispensable)

### 6.1 E-mail du manager (connexion + bons de livraison)

**Pilote Côte d’Ivoire :** définir sur Netlify (scope *Production*) :

```env
SEED_MANAGER_EMAIL=kfallet@gmail.com
MANAGER_PASSWORD=admin1234
```

Après déploiement, une connexion avec **`kfallet@gmail.com` / `admin1234`**
réaligne automatiquement l’e-mail en base s’il avait été remis à `manager@demo.fr`
(pas besoin d’appeler sync manuellement dans ce cas).

Fallback manuel (sans redeploy) :

1. Connexion temporaire : `manager@demo.fr` / `admin1234`  
2. `POST /api/v1/admin/sync-pilot-identity` (session manager)  
3. Connexion : **`kfallet@gmail.com`** / `admin1234`

Un **seed** avec `SEED_MANAGER_EMAIL` défini réécrit aussi l’e-mail manager.

L’e-mail part **uniquement** vers les adresses enregistrées dans la table `managers`.

### 6.2 Téléphone responsable (SMS OTP)

Pour chaque arrêt de tournée :

1. Manager → **Planifier une tournée** ou modifier une tournée existante  
2. Sur l’arrêt : champ **Téléphone responsable** → `+22507XXXXXXXX` (10 chiffres après +225)  
3. C’est **ce numéro** qui reçoit le SMS OTP

Sans numéro sur le **point catalogue** (et sans copie sur l’arrêt) : erreur 422 *« Téléphone responsable du point manquant »*.
Le SMS lit d’abord le téléphone du catalogue Points de livraison.

---

## 7. Checklist de validation

Cochez dans l’ordre :

- [ ] `JWT_SECRET` défini sur Netlify (production)  
- [ ] `EMAIL_PROVIDER=smtp` + identifiants Brevo  
- [ ] `EMAIL_FROM` vérifié chez Brevo  
- [ ] `PUBLIC_BASE_URL` = URL Netlify exacte  
- [ ] `SMS_PROVIDER=textbee` (ou twilio) + clés  
- [ ] Téléphone Android Textbee allumé et connecté  
- [ ] Manager en base avec **votre** e-mail  
- [ ] Arrêt de test avec **votre** numéro en contact responsable  
- [ ] Redéploiement Netlify après changement de variables  

### Parcours de test manuel

1. Manager : créer / vérifier une tournée pour **aujourd’hui**, contact = votre mobile  
2. Livreur : se connecter, démarrer l’arrêt, photos, déclaration  
3. **Envoyer OTP** → vous devez recevoir un **SMS** sur le contact du point  
4. Saisir le code OTP, confirmer (GPS sur place ou bypass dev)  
5. Vérifier **e-mail** dans la boîte du manager configuré  

### Vérifier les logs Netlify (si échec)

1. Netlify → **Functions** → `api`  
2. Chercher :
   - `[SMS MOCK]` → SMS encore en mock  
   - `[EMAIL MOCK]` → e-mail encore en mock  
   - `[textbee] envoi SMS échoué` → problème Textbee  
   - `[deliveryNotifications] Échec e-mail` → problème SMTP  

---

## 8. Dépannage

| Symptôme | Cause probable | Action |
|----------|----------------|--------|
| **« Site not found »** (page Netlify grise) | Aucun deploy **production** publié | Dashboard → Deploys → Publish, ou `npx netlify deploy --prod` |
| **API en erreur (`NETLIFY_DB_URL`)** | Variable absente ou deploy pas relancé | Copier connection string → `NETLIFY_DB_URL` → **redéployer** |
| **`Database migration failed: branch for deploy not found`** | Deploy **preview** sans branche DB créée à temps | Relancer le deploy ; pour le pilote, privilégier **production** (`Trigger deploy` sur `main` ou `netlify deploy --prod`). Les migrations prod sont déjà OK si `netlify database status --branch production` ne montre aucune migration *pending*. |
| Aucun SMS | `SMS_PROVIDER=mock` ou absent | Passer à `textbee` / `twilio` + redéployer |
| Aucun SMS | Mauvais numéro | Vérifier contact de l’**arrêt**, pas le livreur |
| Aucun SMS | Textbee offline | Ouvrir l’app Android, vérifier internet |
| Erreur 503 à l’envoi OTP | Textbee/Twilio en échec | Logs Netlify ; tester clés API |
| Aucun e-mail | `EMAIL_PROVIDER=mock` | Passer à `smtp` + Brevo |
| Aucun e-mail | Mauvais destinataire | E-mail = compte **manager**, pas contact point |
| Aucun e-mail | Livraison non confirmée | L’e-mail part **après** `POST /confirm`, pas à l’envoi OTP |
| E-mail en spam | Domaine non vérifié Brevo | Vérifier SPF/DKIM sur `EMAIL_FROM` |
| Code OTP inconnu en prod | Normal | Pas de `OTP_CODE` en prod — lire le SMS |
| Code `123456` en local seulement | `allowTestBypass()` | Affiché en dev, pas sur Netlify prod |

### Mode secours (tests uniquement, pas pilote réel)

```env
SMS_OTP_FAIL_OPEN=true
```

Permet de continuer si le SMS échoue — **déconseillé en production pilote** (le responsable ne reçoit pas le code).

---

## 9. Fichiers de référence

| Fichier | Rôle |
|---------|------|
| [`.env.example`](../.env.example) | Toutes les variables commentées |
| [`config/pilot-netlify.env.example`](../config/pilot-netlify.env.example) | Bloc prêt pour Netlify (pilote) |
| [`VALIDATIONS-TESTS.md`](../VALIDATIONS-TESTS.md) §3 et §7 | Détails techniques SMS / e-mail |
| [`docs/TELEPHONES-CI.md`](TELEPHONES-CI.md) | Format `+225` |

---

## 10. Prochaine étape suggérée

1. Créer compte **Brevo** + configurer **Textbee** sur un Android CI  
2. Renseigner les variables Netlify (§5)  
3. Redéployer  
4. Créer un manager avec **kfallet@gmail.com** (ou votre e-mail)  
5. Planifier un arrêt test avec **votre mobile** en contact responsable  
6. Refaire le parcours livreur complet

Pour de l’aide sur une variable précise ou une capture d’écran Netlify/Brevo/Textbee, indiquez à quelle étape vous êtes bloqué.

---

## 11. Multi-entreprise & commercialisation

Voir [`docs/MULTI-TENANT.md`](MULTI-TENANT.md) : isolement `company_id`, inscription `/manager/register`, ops `GET /admin/ops-status`.
