# Sécurité opérationnelle — TraceO®

Checklist à exécuter avant et pendant le pilote production.

## 1. Variables Netlify (production)

Exécuter localement avec les variables exportées :

```bash
npm run audit:env
# ou
CONTEXT=production JWT_SECRET=... SMS_PROVIDER=textbee bash scripts/audit-production-env.sh
```

| Variable | Obligatoire prod | Notes |
|----------|------------------|-------|
| `JWT_SECRET` | Oui | `openssl rand -base64 48`, ≥ 32 caractères |
| `NETLIFY_DB_URL` | Oui | Jamais dans le dépôt |
| `PUBLIC_BASE_URL` | Oui | URL canonique du site |
| `SMS_PROVIDER` | Oui | `textbee` ou `twilio` — pas `mock` |
| `EMAIL_PROVIDER` | Recommandé | `smtp` en prod |
| `SENTRY_DSN` | Recommandé | Erreurs API (Functions) |
| `VITE_SENTRY_DSN` | Recommandé | Erreurs PWA (build Vite) |

### Interdits en production

- `OTP_CODE`, `DRIVER_PIN`
- `SMS_PROVIDER=mock`, `EMAIL_PROVIDER=mock` (sauf test exceptionnel)
- `ALLOW_RESET=true`, `ALLOW_SEED=true` (sauf maintenance ponctuelle)
- `GEOFENCE_BYPASS` sans `ALLOW_GEOFENCE_BYPASS=true`
- `SMS_OTP_FAIL_OPEN=true` (sauf urgence documentée)

### À activer volontairement seulement

- `ALLOW_SELF_SIGNUP=true` — inscription publique
- `ALLOW_GEOFENCE_BYPASS=true` + `GEOFENCE_BYPASS=true` — pilote terrain sans GPS

## 2. Comptes et accès

- [ ] Activer **2FA** sur Netlify, GitHub, Brevo/SMTP, Textbee
- [ ] Changer le mot de passe manager démo (`manager@demo.fr` / `admin1234`)
- [ ] Changer les PIN livreurs démo (`1234`)
- [ ] Limiter les membres de l’équipe ayant accès au dashboard Netlify
- [ ] Activer **2FA admin** dans TraceO : `/manager/security` (compte admin)

## 3. Surveillance

- [ ] Configurer `SENTRY_DSN` (API) et `VITE_SENTRY_DSN` (PWA) — erreurs client + serveur
- [ ] `VITE_SENTRY_ENV` : `production` (prod) / `preview` (deploy previews) — défini dans `netlify.toml`
- [ ] Surveiller les logs Netlify : pics `401`/`429` sur `/login-driver`, `/confirm-otp`
- [ ] Filtrer les logs `type=security_alert` — pics login (>25 échecs / 5 min) ou OTP (>20 / 5 min) — **non envoyés à Sentry**
- [ ] Vérifier `/api/v1/health` → champ `security.issues` vide en prod
- [ ] `GET /api/v1/admin/ops-status` (manager) — flags `allowSeed`, `allowReset`, `security`

### Sentry — vraies erreurs vs bruit

| Canal | Contenu |
|-------|---------|
| **Sentry** | Exceptions métier non filtrées, bugs reproductibles, erreurs DB persistantes (hors timeout transitoire) |
| **Logs Netlify** | `type=security_alert` (spikes login/OTP), `Failed query` + `ETIMEDOUT` ponctuel |
| **Pas d’alerte e-mail** | Spikes sécurité, bots, ChunkLoadError PWA, script `sentry:test` |

Filtres applicatifs (`shared/sentryFilters.ts`) : test Sentry, stack overflow sérialisation, spikes, cache PWA, `Failed query` + cause réseau transitoire.

**Alertes Sentry recommandées** : `environment:production`, `level:error`, seuil > 5 événements / 15 min — pas « chaque nouvelle issue ».

Hors pilote actif : retirer `VITE_SENTRY_DSN` de Netlify pour couper le bruit navigateur/bots.

## 4. Protection base pilote (reset / E2E)

La prod Netlify bloque `ALLOW_RESET` / `ALLOW_WIPE_USERS` sur l’API publique, **mais** `netlify dev` et `npm run test:e2e` en local peuvent encore toucher **la même** Postgres si le projet est lié au site pilote.

### Garde-fous en place (code)

| Mécanisme | Effet |
|-----------|--------|
| `config/production-db.fingerprint` | Empreinte hostname de la base pilote |
| `assertDatabaseWipeAllowed()` | Refuse `ALLOW_WIPE_USERS` sur cette base (sauf `ALLOW_PRODUCTION_DB_WIPE`) |
| `assertDatabaseResetAllowed()` | Refuse tout reset admin **hors** `CONTEXT=production` sur la base pilote |
| Journal `security_audit_events` | `admin.reset`, `admin.reset.refused`, `admin.seed` |

### E2E et CI — branche DB dédiée (`e2e`)

La branche Postgres **`e2e`** est provisionnée sur Netlify Database (hostname distinct de la prod pilote).

**Création / renouvellement** (une fois, ou si la branche a expiré) :

```bash
git checkout -b e2e   # ou git checkout e2e
npx netlify deploy --context branch:e2e --message "Provision branche DB e2e"
npx netlify database status --branch e2e --show-credentials
```

Copier la connection string → secret GitHub **`E2E_DATABASE_URL`** et fichier local **`.env.e2e.local`** (gitignored) :

```bash
# .env.e2e.local
E2E_DATABASE_URL=postgresql://…
```

**Utilisation locale** :

```bash
set -a && source .env.e2e.local && set +a
npm run db:fingerprint -- "$E2E_DATABASE_URL"   # ≠ 16950163f70780b3
npm run test:e2e
```

**CI** : le workflow `.github/workflows/e2e.yml` lit `secrets.E2E_DATABASE_URL`.

Sans `E2E_DATABASE_URL`, les tests E2E **échouent** sur reset (protection) au lieu d’effacer les comptes pilote.

Dashboard : [Database → branche e2e](https://app.netlify.com/projects/pwa-livreur/database).

### Urgence (re-seed sans wipe)

```bash
export NETLIFY_DB_URL="$(npx netlify env:get NETLIFY_DB_URL --context production)"
export SEED_MANAGER_EMAIL=kfallet@gmail.com MANAGER_PASSWORD=admin1234 DRIVER_PIN=1234
npx tsx --input-type=module -e "import { seedDemoData } from './server/db/seed.ts'; console.log(await seedDemoData())"
```

## 5. Rotation des secrets

| Secret | Fréquence suggérée |
|--------|-------------------|
| `JWT_SECRET` | Annuelle ou après suspicion de fuite |
| Clés SMS / SMTP | Annuelle |
| `ADMIN_API_TOKEN` | À chaque usage maintenance |

Après rotation `JWT_SECRET` : redéployer — les sessions en cours expirent sous 8 h.

## 6. Formation terrain

- Ne pas partager les liens certificat (`?access=`) publiquement
- Ne pas photographier les écrans contenant OTP ou PIN
- Signaler tout compte ou livraison suspecte au support

## Références

- [`config/pilot-netlify.env.example`](../config/pilot-netlify.env.example)
- [`docs/CONFIGURATION-PILOTE.md`](CONFIGURATION-PILOTE.md)
- [`docs/PENTEST-CHECKLIST.md`](PENTEST-CHECKLIST.md)
