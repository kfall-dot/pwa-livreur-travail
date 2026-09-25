# Reprise de travail — comment repartir sur une nouvelle machine

> Document d'orientation pour un **développeur** (humain ou IA) qui reprend le projet
> sur un poste neuf. Il ne remplace pas `README.md` : il donne l'**état du travail**,
> les **règles à ne pas casser** et les **pièges connus**.
>
> Dernière mise à jour : 25 septembre 2026.

---

## 1. Repartir de zéro en 4 étapes

### 1.1 Outillage (sur PC Windows)

| Outil | Rôle | Remarque |
|---|---|---|
| **Node.js LTS** | build + exécution | obligatoire (projet TypeScript / Vite) |
| **Git pour Windows** | clone + historique | cocher « Git from the command line » → installe **Git Bash** |
| **VS Code** | IDE | extension **Cline** si l'on reprend l'historique de chat |
| **WSL** (optionnel) | exécution des scripts bash | évite de porter les 11 scripts `.sh` |

> ⚠️ **Le projet est bash-dépendant** : `npm run dev:local`, `npm run verify`,
> `npm run regression`, `npm run db:migrate` passent tous par des `.sh`.
> Sans Git Bash (ou WSL), ces commandes sont **inutilisables** — ce n'est pas bloquant
> pour `dev`, `lint`, `test`, `test:e2e` (voir §5), mais c'est bloquant pour
> la non-régression complète et les migrations.

### 1.2 Code

```bash
cd /c/Users/TonNom/projects        # ou ~/projects sous WSL
git clone git@github.com:kfall-dot/pwa-livreur-travail.git
cd pwa-livreur-travail
npm install
```

### 1.3 Variables d'environnement

Quatre fichiers, **jamais commités** :

| Fichier | Usage | Contenu minimal |
|---|---|---|
| `.env.development` | dev quotidien | `DATABASE_URL`, `JWT_SECRET`, `VITE_API_URL`, `PUBLIC_BASE_URL` |
| `.env.e2e.local` | **non-régression** | `E2E_DATABASE_URL` (branche Neon `e2e`, **jamais la prod**) |
| `.env.railway.local` | prod Railway | `DATABASE_URL`, `JWT_SECRET`, clés SMS/e-mail |
| `.env.example` | gabarit | — (versionné, référence) |

> 🔐 **Ne jamais réutiliser l'URL de la base de prod pour l'e2e.** Le reset e2e
> (`POST /admin/reset`) est un `TRUNCATE` : il vide la base. La protection est
> dans `server/config/databaseProtection.ts` (refuse une base de prod), **ne pas
> la contourner**. Où trouver les URL Neon : `docs/SECURITY-OPS.md` §4.

### 1.4 Historique Cline (optionnel)

Deux archives ont été déposées sur le Bureau du Mac source :

| Archive | Contenu | Destination sur PC |
|---|---|---|
| `cline-data.zip` | sessions, base SQLite, maquettes HTML | extraire dans `C:\Users\<Toi>\` → dossier `.cline` |
| `pwa-livreur-secrets.zip` | les 3 fichiers `.env` | extraire dans le dossier du projet |

> **À savoir honnêtement** : Cline mémorise des **chemins absolus**. Sur PC,
> l'historique s'affichera mais rattaché à `/Users/falletkone/…`, qui n'existe pas.
> Les maquettes HTML resteront dans un dossier orphelin.
>
> **Recommandation** : ne **pas** compter sur l'historique de chat. Ce document +
> les docs versionnées suffisent à reprendre le travail, et sont *meilleurs* que
> l'historique (ils sont à jour, alors qu'une conversation ne l'est pas).

---

## 2. Où est le projet

**TraceO** — PWA de traçabilité des livraisons + module achats chantier BTP.

| Élément | Valeur |
|---|---|
| Dépôt | `git@github.com:kfall-dot/pwa-livreur-travail.git` |
| Branche | `master` (développement **et** production) — pas de workflow de release |
| Derniers commits | `3a3ea81` docs guide par rôle + maquettes · `9ef346f` livraisons mensuelles + fiche chantier + exports CMPT |
| Stack | React + Vite + TypeScript · Express + Drizzle ORM · PostgreSQL (Neon) · Playwright |
| Hébergement prod | Railway (`Dockerfile`, `.env.railway.local`) ; Netlify Functions en héritage (`netlify/`) |
| Déploiement | CD direct sur `master` (pousser = prod) |

### Architecture en une phrase

```
PWA livreur (:5173)  +  Dashboard gestionnaire /manager (:5173)
                    └── API Express + Postgres commune (server/)
```

`server/` = API + règles métier · `src/` = React · `shared/` = code partagé
(livreur **et** serveur) · `e2e/` = tests Playwright + `INVARIANTS.md`.

---

## 3. Les règles à ne pas casser

### 3.1 Les 90 invariants (`e2e/INVARIANTS.md`) — la vraie spécification

Le comportement attendu de l'application est écrit **dans les tests**, pas dans une
spec séparée. **Avant toute modification, lire l'invariant concerné** : il dit
exactement ce qui doit rester vrai, et son fichier e2e indique où le tester.

| Plage | Sujet |
|---|---|
| I01–I20 | Livreur : GPS, OTP, déclaration partielle, photos, certificats |
| I21–I50 | Pièces jointes, EB WhatsApp, prix SA, persistance des saisies |
| I51–I80 | Circuit achats BTP : DA, chiffrage, enveloppe budgétaire, feux, approbations |
| I81–I85 | Facturation BC : saisie SA, transmission, espace CMPT |
| I86–I91 | Suivi chantier, catalogue, sidebar, fiche chantier, livraisons mensuelles |

> Numérotation discontinue : **I73 n'est pas attribué** (90 invariants pour une
> numérotation allant jusqu'à I91). Ne pas supposer que `I(n-1)` existe.

Le fichier contient aussi une section **« Régressions déjà corrigées (ne pas
réintroduire) »** : chaque ligne y décrit un bug réellement subi par le client.
**La lire avant de toucher à un composant** — ces pièges se sont déjà produits.

### 3.2 Multi-entreprise : l'isolation est un invariant de sécurité

Toutes les requêtes sont filtrées par `companyId` (tenancy). Le test
`e2e/manager-multitenant-authz.spec.ts` tente explicitement de **lire les données
d'une autre société** et doit échouer.

> 🔒 **Règle absolue** : aucune requête sans `companyId`. Si tu ajoutes un `select`,
> ajoute le filtre société dans le même lot, et fais couvrir par le test multitenancy.

### 3.3 Rôles : la matrice est centralisée, pas dispersée

`src/pages/manager/procurement/procurementUi.tsx` regroupe les helpers de rôle
(`isProcurementWorkspaceRole`, `canSeeSuiviChantier`, `isSiteManagerRole`, …) et
`ManagerDashboardPage.tsx` porte les garde-fous de redirection d'onglet
(`LOGISTICS_ONLY_TABS`, `SA_MANAGER_TABS`).

> Ne pas disperser de `role === '…'` dans les composants : passer par ces helpers,
> sinon on casse silencieusement l'accès d'un rôle (I85, I89).

Les 8 rôles achats : `site_controller` (SA) · `technical_director` (DT) ·
`daf` · `purchasing` · `pdg` · `controle_gestion` (CdG) · `accountant` (CMPT) ·
`site_manager` (chef de chantier).

### 3.4 Registre BC : calculé côté serveur, jamais recompté côté UI

Montants livrés, prorata des partielles et consommations sont calculés **dans les
services** (`bcRegister.ts`, `siteIndicators.ts`, `siteBudget.ts`) et exposés déjà
formatés (`amountLabel`). Un composant qui recalcule un total introduit une
divergence entre le détail et l'export.

---

## 4. Pièges connus (perdus de vue, pas documentés ailleurs)

| Piège | Pourquoi c'est piège | Réflexe |
|---|---|---|
| **Les tests e2e dépendent d'une base Neon e2e allumée** | Si la branche est « endormie », tous les tests échouent en `ECONNREFUSED` — infra, pas code | Démarrer : `bash scripts/e2e-server.sh`, vérifier `curl localhost:8888/api/health` |
| **`npm test` ne liste pas les nouveaux tests** | La liste des fichiers est **écrite en dur** dans le script `test:unit` du `package.json` | Ajouter son `.test.ts` dans ce script, sinon il n'est jamais exécuté |
| **Le port 8888 reste occupé** | Le serveur e2e est laissé en vie après une campagne | `lsof -ti :8888 \| xargs kill` |
| **Écrire un gros fichier par heredoc casse les espaces** | Vu sur les maquettes HTML (`margin:38px auto0`, `<divclass=`) | Écrire avec l'éditeur, jamais par heredoc ; vérifier après (`grep`) |
| **Une branche testée après une autre est morte** | `if (status === 'delivered') … if (outcome === 'refused')` : la seconde branche ne peut jamais s'exécuter | Ordonner les tests du plus spécifique au plus général |
| **Le libellé `'refused'` n'est jamais produit** | Le formulaire livreur écrit `'rejected'` ; `'refused'` reste un repli | Conserver le repli, ne jamais le supprimer seul |
| **Charger des données pendant le rendu** | React 18 + ESLint : le calcul dans le corps de rendu échoue en revue | Calculer dans `load()` ou un `useMemo` pur |
| **Pousser sur `master` = mettre en production** | Pas de branche de release, pas de staging | Valider `tsc` + lint + tests **avant** chaque `git push` |

---

## 5. Commandes de validation (dans cet ordre)

```bash
npx tsc -b                 # compilation front + serveur — doit sortir vide
npx eslint .               # 0 erreur (7 warnings préexistants tolérés)
npm test                   # tests unitaires (tsx --test)
npm run test:e2e           # Playwright — exige le serveur e2e allumé
```

Pour la non-régression élargie (lente, quelques minutes) :

```bash
npm run verify             # build serveur + lint + e2e
npm run regression         # campagne e2e complète
```

> `npm run verify` et `npm run regression` passent par des `.sh` → **Git Bash ou WSL
> obligatoire** sur PC (cf. §1.1).

État au dernier contrôle : `tsc` 0 erreur · `eslint` 0 erreur · 179 tests unitaires
passés · e2e `I91`, `manager-edit-tour` et `manager-replan` passés.

---

## 6. Ce qui a été livré récemment (état au 25/09/2026)

| Livraison | Invariants |
|---|---|
| **Livraisons mensuelles** : vue mois par défaut, filtre par jour avec retour « voir tout le mois », sélecteur de mois passés, menu **Chantier** (chantiers ayant des BC émis) | I91 |
| **Partielles au registre BC** : visibles avec le libellé « livraison partielle » en Observation et un montant au prorata | I90 |
| **Fiche chantier** : clic sur une ligne du catalogue → modale complète (encadrement, enveloppe, consommation, livraisons) | I90 |
| **Colonne « Livraisons 30 j »** : calcul réel depuis le registre BC (elle était codée en dur à 0) | I90 |
| **Navigation du calendrier Comptabilité** : « Suivant » avançait en arrière (inversion de l'ordre décroissant des mois) | — |
| **Exports Rapports CMPT** : les 4 boutons étaient des placeholders inertes ; ils génèrent maintenant de vrais `.xls` | — |
| **Refus comptés comme « Livrées »** : le test de `delivered` passait avant celui du refus | `src/lib/deliveryBucket.test.ts` |
| **Bandeau « Voir les tâches »** retiré de la page Livraisons | — |

Les quatre derniers points sont des **bugs corrigés en cours de recette client** :
ils n'ont pas d'invariant e2e propre, seulement un test unitaire ou une
vérification manuelle. Ne pas les réintroduire.

---

## 7. Prochaines étapes connues

`ameliorations-futures.md` fait foi. Les deux subjects ouverts :

| Sujet | Statut | Enjeu |
|---|---|---|
| **Holding multi-compagnies** | consigné | Les rôles PDG/DAF/CdG/CMPT doivent voir **toutes** les sociétés de la holding ; les EB sont centralisées au SA, une compagnie = un département SA. **Non implémenté** — chantier structurel le plus lourd. |
| **Dossier BC** (BL + refonte saisie facture) | proposé, maquette validée | Le BL papier n'a nulle part où être joint ; la saisie est saturée. ~2-3 j en 4 lots, table `bc_documents`. |

> ⚠️ Le besoin « holding » est **différent** du multi-entreprise déjà implémenté.
> Aujourd'hui une société = un client de l'application, isolé (invariant de
> sécurité §3.2). Le besoin holding impose de **lire au travers** de cette
> isolation pour 4 rôles — c'est une évolution d'architecture, pas un réglage.
> **Ne pas traiter à la légère.**

---

## 8. Cartographie des documents

| Document | Contenu | Quand le lire |
|---|---|---|
| `e2e/INVARIANTS.md` | 90 invariants (I01–I91, **I73 non attribué**) + régressions corrigées | **avant toute modif** |
| `docs/GUIDE-UTILISATION-PAR-ROLE.md` | actions possibles par rôle | pour former un utilisateur |
| `docs/BTP-REGLES-CIRCUIT-ACHATS.md` | qui fait quoi dans le circuit achats | pour comprendre un workflow |
| `docs/FONCTIONNALITES.md` | périmètre fonctionnel détaillé | vision d'ensemble |
| `docs/MULTI-TENANT.md` | modèle multi-entreprise | avant de toucher à l'isolation |
| `docs/SECURITY-OPS.md` | secrets, prod, Neon (§4 pour les URL) | avant tout déploiement |
| `docs/CONFIGURATION-PILOTE.md` | variables du pilote BTP | pour seeder un environnement |
| `docs/PENTEST-CHECKLIST.md` | points à faire tester | avant livraison client |
| `docs/PRESENTATION-CLIENT.md` | supports de présentation | pour une démo |
| `docs/mockups/` | maquettes HTML | voir **`docs/mockups/LISEZ-MOI.md`** (quelle version est à jour) |
| `VALIDATIONS-TESTS.md` | quoi tester avant livraison | check-list de recette |

