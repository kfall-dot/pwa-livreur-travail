# Multi-entreprise, mise en service et opérations prod

## Modèle

Chaque **entreprise** (`companies`) isole :

| Table | Champ |
|-------|--------|
| `managers`, `drivers`, `tours` | `company_id` |
| `supermarkets`, `products`, `manager_tasks` | `company_id` |

Les arrêts (`delivery_points`) sont isolés via leur tournée.

- JWT **manager** : `{ sub, email, role: 'manager', companyId, managerRole }`
- JWT **livreur** : `{ sub, phone, companyId }`
- Les listes dashboard filtrent toujours par `manager.companyId`

Entreprise démo seed / E2E : `co-demo` (slug `demo`).

## Rôles gestionnaires

| Rôle | Droits |
|------|--------|
| **admin** | Gère les comptes gestionnaires (invitations, modification, suppression), plus livreurs, catalogue, tournées, tâches |
| **manager** | Livreurs, catalogue, tournées, tâches — **pas** d’accès à l’onglet Gestionnaires |

- Le premier compte créé via `register-company` est **admin**.
- Les invitations acceptées créent un compte **manager** par défaut.
- Impossible de supprimer le **dernier admin** ni le dernier gestionnaire de l’entreprise.

## Mise en service autonome

1. Ouvrir `/manager/register`
2. Renseigner entreprise + manager + e-mail + mot de passe (≥ 8)
3. API : `POST /api/v1/auth/register-company`

**Production** : exiger `ALLOW_SELF_SIGNUP=true` sur Netlify.  
Sans ce flag, l’inscription est refusée (403) — à activer volontairement ou créer les comptes côté support.

## Gestionnaires (collègues)

Depuis **Équipe → Gestionnaires** (admin uniquement) :

- **Inviter** un collègue par e-mail (lien unique, validité 72 h)
- Lister les **invitations en attente** (renvoyer / annuler)
- Lister, modifier (nom, e-mail, rôle, mot de passe) et supprimer les comptes existants

Le collègue active son compte sur `/manager/invite?token=…` et choisit son mot de passe.

**Mot de passe oublié** : `/manager/forgot-password` → e-mail → `/manager/reset-password?token=…`

API :

| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/dashboard/managers` | admin |
| `GET` | `/dashboard/managers/invites` | admin |
| `POST` | `/dashboard/managers/invite` | admin |
| `POST` | `/dashboard/managers/invites/:id/resend` | admin |
| `DELETE` | `/dashboard/managers/invites/:id` | admin |
| `PATCH` | `/dashboard/managers/:id` | admin |
| `DELETE` | `/dashboard/managers/:id` | admin |
| `POST` | `/auth/accept-manager-invite` | public |
| `POST` | `/auth/manager-forgot-password` | public |
| `POST` | `/auth/manager-reset-password` | public |

> La création directe `POST /dashboard/managers` (mot de passe choisi par l’admin) a été **retirée** — seule l’invitation e-mail est supportée.

## Opérations prod

| Endpoint | Auth | Rôle |
|----------|------|------|
| `GET /api/v1/health` | public | `multiTenant`, `selfSignup` |
| `GET /api/v1/admin/ops-status` | admin / manager | compteurs + flags `ALLOW_*` |
| `POST /api/v1/admin/sync-pilot-identity` | admin / manager | réaligner e-mail pilote sur `co-demo` |
| `POST /api/v1/admin/seed` | + `ALLOW_SEED` | seed **uniquement** `co-demo` |
| `POST /api/v1/admin/reset` | + `ALLOW_RESET` | wipe ; catalogues/users seulement si `ALLOW_WIPE_USERS` |

Checklist Netlify (nouveau client) :

1. Appliquer les migrations (`npm run db:migrate`), dont `20260722140000_manager_roles_invites`
2. `JWT_SECRET` fort, `PUBLIC_BASE_URL`, SMS/e-mail réels (`EMAIL_PROVIDER=smtp`)
3. Décider `ALLOW_SELF_SIGNUP` (true = self-service, false = onboarding manuel)
4. **Ne pas** laisser `ALLOW_SEED` / `ALLOW_RESET` en prod client
5. Demander aux managers de se reconnecter après migration rôles (nouveau JWT avec `managerRole`)

## Limites actuelles (phase suivante)

- Un e-mail / un téléphone = une seule entreprise (unicité globale)
- Pas de branding / facturation par tenant
- Le seed démo ne touche pas les entreprises créées via register
- Invitation livreur : champs `invite_token` en schéma, flux non implémenté
