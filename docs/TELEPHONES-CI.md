# Téléphones — Côte d'Ivoire (+225)

L'application est conçue pour la **Côte d'Ivoire**. Tous les champs téléphone de l'interface utilisent le format ivoirien.

## Format attendu

| Contexte | Format | Exemple |
|----------|--------|---------|
| Livreur (connexion PWA) | `+225` + 10 chiffres | `+2250701234567` |
| Saisie locale (sans indicatif) | 10 chiffres | `0701234567` |
| Responsable magasin (OTP SMS) | `+225` + 10 chiffres | `+2250102030405` |

Préfixes mobiles courants en CI : `07`, `05`, `01`.

## Constantes partagées (code)

Définies dans `src/lib/phone.ts` :

- `CI_PHONE_PLACEHOLDER` — placeholder formulaires vides (`+22507XXXXXXXX`)
- `CI_PHONE_INPUT_TITLE` — infobulle manager (`+225 suivi de 10 chiffres`)
- `PHONE_FORMAT_HINT` — message d'aide sous le login livreur
- `CI_PHONE_EXAMPLE` / `DEMO_DRIVER_PHONE` — compte seed / login démo (`+2250701234567`)

## Écrans vérifiés

| Écran | Champ | Placeholder |
|-------|-------|-------------|
| Login livreur | Téléphone | `+2250701234567` |
| Manager → Livreurs | Téléphone | `+2250701234567` |
| Manager → Livreurs (édition) | Téléphone | `+2250701234567` |
| Manager → Points | Tél. responsable (OTP) | `+2250701234567` |
| Manager → Points (édition) | Tél. responsable (OTP) | `+2250701234567` |

## Comptes démo (seed)

| Rôle | Nom | Téléphone (1ère création) | PIN |
|------|-----|---------------------------|-----|
| Livreur principal | Kouassi Livreur | `+2250701234567` | `1234` |
| Livreur secondaire | Aya Livreur | `+2250700430402` | `1234` |

**Important — le numéro d’Aya ne doit plus être réécrit :**
1. Un `seed` **sans** wipe ne touche **jamais** au téléphone d’un livreur déjà en base.
2. Un `reset` n’efface les livreurs que si `ALLOW_WIPE_USERS=true` — **refusé** si `NETLIFY_DB_URL` pointe vers la base pilote (`config/production-db.fingerprint`).
3. Seed catalogue / arrêts : **ne réécrit plus** les `contactPhone` déjà saisis.
4. Sur Netlify : `SEED_DRIVER2_PHONE=+2250700430402` (déjà le défaut code).

## À ne pas utiliser en prod / saisie utilisateur

- Numéros français `+33…`
- Format Québec `418…` (accepté uniquement par l'API pour compatibilité tests automatisés internes — **non affiché** dans l'UI)

## Création livreur / point côté manager

Toujours saisir le **format international +225**. Les OTP SMS partent vers ce numéro via le provider configuré.

## Envoi SMS OTP

| Provider | Usage |
|----------|--------|
| `mock` | Dev / E2E — pas d’envoi réel |
| `textbee` | Pilote — Android + SIM CI ([textbee.dev](https://textbee.dev)) |
| `twilio` | Production |

Configuration détaillée : [`VALIDATIONS-TESTS.md`](../VALIDATIONS-TESTS.md) §3 et [`.env.example`](../.env.example).
