# Améliorations futures

Document de référence pour les choix produit/reportés à plus tard.  
Dernière mise à jour : 24 septembre 2026.

---

## Tournées multiples le même jour (vue chauffeur)

### Comportement actuel (conservé)

Lorsqu’un livreur a **plusieurs tournées planifiées à la même date** (ex. tournée du matin + tournée de l’après-midi, ou tournée + reliquat) :

- L’API (`GET /tours/today`, `GET /tours/by-date/:date`) fusionne les arrêts **actifs** de **toutes** les tournées du livreur pour la date.
- Les arrêts `failed` (replan obsolète, non effectuée) restent masqués.
- L’interface affiche un récap global et, s’il y a plusieurs tournées, un sous-titre « N tournées » + un bloc par tournée (dépôt).

En base de données, chaque tournée et chaque arrêt restent **distincts** (`tourId` séparés).

Le **dashboard gestionnaire** continue d’afficher les tournées **séparément** (Suivi livraisons groupé par tournée, Planifier par tournée).

### Détails techniques

| Élément | Valeur |
|---|---|
| Métadonnées affichées (dépôt principal, `tour.id`) | Première tournée du jour (la plus ancienne, `createdAt`) |
| Ordre des arrêts | Par date de création de tournée, puis `sequence` dans chaque tournée |
| Calendrier chauffeur | Compte les livraisons visibles (même règle que la liste fusionnée) |

### Décision

**Statut : corrigé (juillet 2026)** — ne plus se limiter à la dernière tournée du jour (sauf arrêts `failed` après replan).
---

## Bon de livraison SA + refonte « Dossier BC » (suivi facture)

### Contexte

Après la livraison du livreur, le SA reçoit la **facture** et souvent un **bon de livraison (BL) papier** du fournisseur (en pratique photographié, reçu via WhatsApp). Aujourd'hui : aucun emplacement pour le BL dans l'application. La saisie vit dans `SuiviBcTab.tsx` — tableau dense (n° facture, observation, vérification, 3 types de 📎), design fonctionnel mais saturé, et **mono-fichier** (`sa_invoice_blob_key`). Justificatifs = simple champ texte `sa_justifs` (pas de fichier).

### Options envisagées

| Option | Contenu | Avantage | Limite |
|---|---|---|---|
| 1 | Colonne « BL » dans le tableau actuel (duplication du mécanisme facture) | Rapide (~½ j) | Design inchangé, 1 seul fichier, tableau plus dense |
| 2 | Refonte « Dossier BC » : panneau latéral au clic (livraison + pièces + suivi + timeline) | Résout le design, scalable, mobile | ~2-3 j |
| 3 | Table `bc_documents` — multi-fichiers par type | Socle pérenne | Sans effet UI seule |

### Maquette « Dossier BC » (résumé)

- **Tableau allégé** : colonne « Dossier » unique — jauge `◐ 2/4` + pastilles 🧾 facture · 📄 BL · 📎 pièces livreur ; clic → panneau.
- **Panneau latéral** (~500 px) : en-tête (BC, fournisseur, chantier, montant, date, pill PARTIEL) · timeline `Livré → Facture reçue → Transmise → Payée` · 🚚 Livraison (déclaration + photos livreur déjà stockées) · 📁 Pièces en 3 zones (Facture / Bon de livraison / Justificatifs — **plusieurs fichiers** par zone, upload ou 📷 `capture="environment"`, aperçu, suppression, PDF/JPG/PNG ~5 Mo) · ✍️ Suivi (n°, observation, vérification — règles actuelles) · 📤 Transmettre (n° + fichier requis, règle conservée).
- **Comptable** : même panneau en lecture seule + zone paiement.

### Socle technique

Table `bc_documents` : `id · purchase_order_id · kind (facture|bon_livraison|justificatif) · blob_key · file_name · content_type · uploaded_by · uploaded_at`. Routes upload/aperçu/suppression paramétrées par `kind` (mécanique base64/blob existante de la facture). Factures existantes `sa_invoice_*` préservées (backfill ou coexistence le temps de la bascule Comptabilité).

### Chiffrage

| Lot | Contenu | Durée |
|---|---|---|
| 1 | Migration `bc_documents` + routes par kind + backfill | ~½ j |
| 2 | Composant `BcDossierDrawer` | ~1 j |
| 3 | Allègement tableau + intégration SA/CMPT | ~½ j |
| 4 | Tests e2e + INVARIANTS | ~½ j |

### Décision

**Statut : proposé (22 septembre 2026)** — maquette à valider avant le lot 1.

---

## Holding multi-compagnies — EB centralisées au SA, rôles transverses

### Contexte

L'application va servir une holding à 4 filiales : BTP, hôtellerie, sécurité, agriculture — chacune avec sa **raison sociale propre**. Chaque compagnie émet des EB via le **formulaire vierge existant** (pas de nouveau canal : le BTP garde en plus l'entrée WhatsApp/chantier). Toutes les EB convergent vers un **SA unique central**. Le processus aval est **identique** quelle que soit la provenance : SA → CdG → DAF → PDG → livraison → facture → paiement. Les rôles **SA, CdG, DAF, PDG, CmPT sont uniques** pour tout le holding ; les opérationnels (chefs de site, DT, contrôleurs, livreurs) restent cloisonnés à leur compagnie. Tout le fonctionnel existant (Livraisons, Suivi BC, Suivi chantier, Comptabilité, Rapports) doit devenir multi-compagnies.

État actuel incompatible : isolation mono-compagnie stricte (`managers.companyId` unique signé dans le JWT, filtres `eq(companyId)` partout), table `companies` sans niveau groupe ni identité légale, un transverse ne peut voir qu'une seule compagnie.

### Décisions validées

- La `company` devient une **provenance**, pas un silo : EB, BC, BT, tournée, livraison, facture, paiement portent le `companyId` de l'émetteur, hérité sur tout l'aval.
- **Périmètre par famille de rôles** (pas de matrice par utilisateur au jour 1) : SA/CdG/DAF/PDG/CmPT = tout le holding ; opérationnels = leur compagnie uniquement.
- Émission hors BTP : formulaire vierge + **compagnie émettrice** (menu restreint aux compagnies autorisées).
- Enveloppes budgétaires **toujours par compagnie** (pas de pot commun inter-filiales).
- Table d'exceptions `manager_company_scopes` prévue mais non nécessaire au jour 1 (ex. futur DT sur BTP + Sécurité).

### Socle technique

- `holdings` (1 ligne : le groupe) + `companies.holding_id` ; enrichir `companies` : raison sociale, sigle, adresse, contacts, logo, **préfixe de numérotation** (`BTP/HOT/SEC/AGR`) pour éviter les collisions de références EB/BC/BT.
- Auth : JWT avec `allowedCompanyIds[]` calculé **côté serveur** ; bascule des requêtes `eq → inArray` pour les 5 rôles centraux ; extension de `manager-multitenant-authz.spec.ts`.
- Migration : rattacher `co-demo` / `co-btp-pilote` au holding + backfill sans élargissement silencieux des opérationnels.
- Sécurité : `security_audit_events.companyId` = compagnie de l'objet, pas du lecteur.

### UI

- **Sélecteur global** `Toutes (holding)` + chaque raison sociale (défaut `Toutes` pour les centraux) ; **colonne « Compagnie »** dans file Achats, Livraisons, Suivi BC, Suivi chantier, Comptabilité, Rapports/exports.
- **KPIs sur le périmètre sélectionné** ; catalogues (chantiers, fournisseurs) rattachés à leur compagnie, visibles au SA central via le sélecteur.
- Mentions légales de l'émetteur sur BC/BT/documents/exports du CmPT (obligation fiscale).

### Chiffrage

| Lot | Contenu |
|---|---|
| 1 | `holdings` + `holding_id` + identité légale + préfixes + backfill (+ compagnie émettrice sur formulaire EB vierge) |
| 2 | Auth périmètre par rôles + `eq → inArray` + tests authz |
| 3 | Sélecteur + colonne Compagnie + KPIs périmètre + mentions légales |
| 4 | e2e multi-filières (EB Hôtellerie visible SA/CdG/DAF/PDG/CMPT, invisible au chantier BTP) + INVARIANTS |

### Décision

**Statut : spécifié (24 septembre 2026) — en attente de réalisation, lot 1 prêt.**

---

## Pistes d’évolution (non planifiées)

À réévaluer si le métier le demande :

1. **Tournées séparées côté chauffeur**  
   Afficher plusieurs blocs ou onglets par tournée, comme le gestionnaire, au lieu d’une liste fusionnée.

2. **N’afficher que la tournée active**  
   Ex. uniquement la dernière tournée replanifiée, en masquant ou archivant les arrêts des tournées précédentes du même jour.

3. **Dépôt et identifiant de tournée**  
   Aujourd’hui issus de la première tournée ; pourrait refléter la tournée la plus récente ou un dépôt explicite « journée ».

4. **Doublons après replanification**  
   ~~Si une replan crée une nouvelle tournée sans retirer les arrêts non livrés de l’ancienne, le chauffeur peut voir des points en double.~~ **Corrigé (juin 2026)** — clôture auto des arrêts obsolètes + fusion API limitée à la dernière tournée.

5. **Vue liste plate en Suivi gestionnaire**  
   Toggle « vue tournée / vue liste » pour recherche ou export (évoqué lors du regroupement par tournée).

6. **Photos sur le bon de livraison (certificat HTML)**  
   Afficher les photos prises par le livreur sur la page certificat (`GET /certificates/:receiptId?view=html`), déjà liée depuis l’e-mail de confirmation OTP.  
   **Recommandation** : privilégier le certificat plutôt que d’embarquer toutes les photos dans le corps du mail (poids, limites SMTP, timeout Netlify Functions à la confirmation).  
   **Piste technique** : charger les blobs `delivery-photos` au rendu du certificat (miniatures + légende `paletteNumber`), comme dans la modale détail gestionnaire ; optionnel : une vignette dans l’e-mail HTML (« N photos sur le certificat »).  
   **Points d’attention** : taille des images (compression), confidentialité (RGPD), livraisons anciennes sans blob stocké.

7. **Livraison hors réseau — zones blanches (Côte d’Ivoire)**  
   **Contexte** : en zone sans couverture, le livreur n’a souvent **ni data mobile ni possibilité d’appel**. La procédure « appeler le magasin » est exclue. La sync serveur intervient en fin de tournée (retour en zone couverte).  
   **Comportement actuel** : la PWA gère déjà hors ligne le démarrage, les photos, la déclaration et la demande OTP (file IndexedDB). **La validation finale est bloquée** sans réseau (`DeliveryPage` : confirm désactivé si `!online`). Le case `confirm` existe dans `sync.ts` mais n’est jamais enfilé. TTL OTP serveur : **10 min** — incompatible avec une sync différée de plusieurs heures.  
   **Recommandation produit (à implémenter plus tard)** :
   - **Code magasin (PIN par point)** — mécanisme principal en zone morte : PIN 4-6 chiffres configuré par le gestionnaire dans le catalogue (`offline_pin_hash` sur `supermarkets`), communiqué **en personne** par le responsable sur place ; confirm via `storePin` + audit `confirmationMethod: 'store_pin'`.
   - **OTP saisi hors ligne** — si le téléphone du magasin a reçu le SMS, le responsable **lit le code au livreur sur place** (pas d’appel) ; saisie + confirm en file, sync au retour réseau ; TTL OTP étendu (`OTP_TTL_HOURS`, ex. 24 h pilote).
   - **Infrastructure sync** : enfiler `confirm` dans `syncQueue` avec GPS + `clientConfirmedAt` horodaté ; ordre garanti par livraison (`start` → photos → `declare` → `send-otp` → `confirm`) ; pas de drop silencieux après retries ; indicateur sync + bannière offline sur `/delivery/:id` ; état local `delivered_pending_sync` jusqu’à certificat réel.
   - **UX livreur** : bascule « Code magasin » / « Code SMS » sur l’écran validation ; messages sans mention d’appel.
   - **Manager** : champ « Code magasin (hors réseau) » dans la fiche point de livraison.
   - **Hors scope initial** : validation manager différée si ni SMS ni PIN possible.  
   **Fichiers concernés** : `DeliveryPage.tsx`, `sync.ts`, `db.ts`, `server/routes/deliveries.ts`, `server/db/queries.ts`, `server/db/schema.ts`, `EditSupermarketModal.tsx`, `docs/FONCTIONNALITES.md`, `docs/CONFIGURATION-PILOTE.md`.  
   **Points d’attention** : PIN faible (hash, rate limit, renouvellement) ; fraude (photos + GPS horodaté + déclaration conservés) ; confirm idempotent côté serveur.

8. **Visionneuse photo plein écran (gestionnaire)**  
   **Comportement actuel** : dans la modale détail livraison (`DeliveryDetailModal`), les photos sont affichées en vignettes 96×96 px (`objectFit: cover`). Le fichier **JPEG complet** est déjà chargé (via `dataUrl` ou `GET /dashboard/photos?key=…`) — seul l’affichage CSS est réduit. Pas de lightbox, pas de bouton « agrandir » ni téléchargement explicite (contournement possible : clic droit → ouvrir l’image dans un nouvel onglet).  
   **Comportement cible** : clic sur une vignette → overlay plein écran (navigation entre photos, légende `paletteNumber`, fermeture Échap / croix) ; optionnel : bouton « Télécharger ».  
   **Piste technique** : composant léger dans `DeliveryDetailModal.tsx` (ou `PhotoLightbox.tsx`) ; réutiliser les `imageSrcs` / URLs déjà chargées — **aucun changement API ni stockage**.  
   **Priorité** : confort UX manager, faible risque de régression (ne touche pas au flux livraison / OTP / géofence).  
   **Fichiers concernés** : `src/pages/manager/modals/DeliveryDetailModal.tsx`.

9. **Alerte géo sur photos (audit optionnel — non prioritaire)**  
   **Statut** : piste non planifiée ; **ne pas modifier** le comportement prod actuel (géofence bloquant + OTP) tant qu’il n’y a pas retour terrain explicite.  
   **Comportement actuel** : géofence **bloquant** au démarrage (200 m) et à la confirmation OTP (100 m) ; photos stockent `lat`/`lng` en metadata Blobs sans contrôle de distance ni alerte manager. L’**OTP magasin** reste la preuve principale de réception telle que déclarée.  
   **Comportement cible (si un jour implémenté)** : ne plus bloquer pour distance ; à chaque upload photo, comparer coords vs point catalogue (seuil 100 m, `PHOTO_GEO_MAX_M`) ; avertissement livreur mais poursuite autorisée ; tâche dashboard `photo_location_alert` + e-mail manager (dedupe) ; badge distance / « Hors zone » dans la modale détail.  
   **Valeur métier** : signal d’**audit** surtout utile si le process OTP magasin est insuffisant — pas un remplacement urgent du géofence. Coords photo **déclaratives** (falsifiables via API), signal faible seul.  
   **Hors scope** : SMS manager, filigrane GPS sur JPEG, blocage si toutes photos hors zone.  
   **Fichiers concernés** : `server/routes/deliveries.ts`, `server/lib/photoGeoAlert.ts` (nouveau), `server/db/schema.ts`, `src/pages/DeliveryPage.tsx`, `src/pages/manager/modals/DeliveryDetailModal.tsx`, `docs/CONFIGURATION-PILOTE.md`.

10. **Réinitialiser verrouillage login livreur (manager)**  
   **Contexte** : après **5 mauvais PIN**, le livreur est bloqué ~30 min (`driverLoginLockout` → clé Netlify Blobs `rate-limits` / `driver-pin-fail:{phone}`). Un rate limit séparé existe aussi sur `login-driver:{phone}` (10 tentatives / 15 min). Aujourd’hui le déblocage passe par `netlify blobs:delete` ou l’attente — pas d’UI.  
   **Comportement cible** : dans la modale **Modifier livreur** (`EditDriverModal`) ou la liste Livreurs, bouton **« Réinitialiser verrouillage login »** (visible admin/manager de la même `companyId`).  
   **API** : `POST /api/v1/dashboard/drivers/:id/clear-login-lockout` — `requireManager`, vérifie `driver.companyId === manager.companyId`, appelle `clearDriverLoginFailures(normalizeDriverPhone(driver.phone))` et supprime aussi la clé `login-driver:{phone}` (`clearRateLimitKey`). Réponse `{ ok: true }`. Journaliser `logSecurityEvent` (`driver.login.lockout.cleared`, actor manager).  
   **UX** : confirmation avant action ; message de succès « Le livreur peut se reconnecter » ; pas de changement de PIN.  
   **Sécurité** : réservé aux managers authentifiés de l’entreprise du livreur ; pas d’endpoint public ; audit trail.  
   **Priorité** : support pilote / exploitation — faible risque, ne modifie pas le flux livraison.  
   **Fichiers concernés** : `server/routes/dashboard.ts`, `server/lib/driverLoginLockout.ts`, `server/lib/securityAudit.ts` (nouvelle action), `src/pages/manager/modals/EditDriverModal.tsx`, `docs/SUPPORT-PILOTE.md`.

11. **shadcn/ui + Lucide (dashboard manager)**  
   **Statut** : reporté volontairement après la refonte TraceO (tokens CSS + shells + toasts). **Ne pas introduire** tant que le pilote n’exige pas densifier les tables / modales.  
   **Contexte** : reco initiale « Fable » — Tailwind + shadcn sur le manager, Lucide pour les icônes ; écartés au profit d’une identité TraceO légère (CSS vars, pas de grosse lib UI).  
   **Comportement cible (si un jour)** :
   - **Lucide React** : remplacer les icônes / glyphs maison (nav livreur, actions manager, empty states) par un set mono cohérent (~15 Ko).
   - **shadcn/ui** (manager uniquement) : `Dialog`, `Tabs`, `Table`, `Select`, `Toast`/`Sonner` — surtout pour Suivi, Planifier, modales détail / édition.
   - **PWA livreur** : rester sur CSS actuel (mobile, offline, budget léger) ; Lucide OK, shadcn optionnel et non prioritaire.
   **Découpage suggéré** : (1) Lucide seul — faible risque ; (2) Tailwind + shadcn sur les modales manager ; (3) migration progressive des `style={{}}` restants hors de `ManagerDashboardPage`.  
   **Points d’attention** : ne pas casser E2E (`data-testid`) ; garder tokens TraceO (`--brand`, `--action`) comme source de thème shadcn ; éviter Material / Ant Design.  
   **Priorité** : confort desktop manager post-pilote — pas bloquant pour la démo board.  
   **Fichiers concernés** : `src/pages/ManagerDashboardPage.tsx`, `src/pages/manager/**`, `src/components/Layout.tsx`, `src/index.css`, `package.json`.

---

## Contexte lié (déjà livré)

- **Suivi livraisons (gestionnaire)** : regroupement par tournée en sections repliables (option A).
- **Replanification** : points d’origine pré-remplis, modifiables (ajout/retrait d’arrêts autorisé) ; replan depuis tâche livraison partielle (reliquat refusé).
- **Modale détail livraison** : quantités attendues/livrées au format « Produit N unités ».

---

## Sécurité de l'information

Audit réalisé en juin 2026. L'application convient à la **démo / dev** ; des durcissements sont nécessaires avant une **production avec données réelles**.

### État des lieux (audit)

#### Points positifs

- Authentification gestionnaire : mot de passe hashé (`bcrypt`), JWT rôle `manager`, routes `/dashboard/*` protégées.
- Authentification livreur : PIN hashé, sessions + refresh token, routes `/tours` et `/deliveries` sous `requireAuth`.
- Endpoints admin (`/admin/seed`, `/admin/reset`) désactivés en production sauf flags explicites.
- Contrôles métier : géorepérage au démarrage, hash anti-doublon photos, OTP à TTL 10 min.

#### Risques identifiés

| Priorité | Risque | Détail |
|---|---|---|
| **Critique** | IDOR livreur | ~~Un livreur authentifié pouvait accéder/modifier une livraison d'un autre via son `deliveryId`.~~ **Corrigé (juin 2026).** |
| **Critique** | Certificats publics | ~~`GET /certificates/:receiptId` sans auth.~~ **Corrigé (juin 2026)** — auth livreur/gestionnaire, token signé `?access=` pour e-mails. |
| **Élevé** | Photos sans contrôle de propriété | ~~Token requis sans lien livreur ↔ livraison.~~ **Corrigé (juin 2026)** avec l'IDOR livreur. |
| **Élevé** | Secrets par défaut | ~~Deux `JWT_SECRET` dev différents.~~ **Corrigé (juin 2026)** — secret unifié + refus en production si absent/faible. PIN/OTP seed restent à durcir en prod. |
| **Élevé** | OTP faible | ~~Pas de blocage après N tentatives.~~ **Corrigé (juin 2026)** — max 5 tentatives + rate limit send/confirm OTP. Code fixe dev uniquement. |
| **Moyen** | CORS ouvert | ~~`cors()` sans restriction.~~ **Corrigé (juin 2026)** — origines limitées en prod (`PUBLIC_BASE_URL` + `CORS_ORIGINS`). |
| **Moyen** | Token gestionnaire en `sessionStorage` | ~~Exposé en cas de XSS.~~ **Corrigé (juin 2026)** — cookie `HttpOnly` + `GET /auth/me`. |
| **Moyen** | Pas de rate limiting | ~~Login, OTP, refresh.~~ **Corrigé (juin 2026)** — login livreur/gestionnaire, send-otp, confirm-otp, refresh. |
| **Moyen** | Mono-tenant | Tous les gestionnaires voient toutes les données (OK démo). |
| **Moyen** | Bypass tests | ~~`GEOFENCE_BYPASS`, `devOtpCode`, `OTP_CODE`, `DRIVER_PIN`.~~ **Corrigé (juin 2026)** — refus au démarrage en production. |

#### Données sensibles

Téléphones, PIN, adresses, contacts magasins, photos de livraison, déclarations partielles, certificats, codes OTP.

### Corrections appliquées

- **IDOR livreur (juin 2026)** : chaque route `/deliveries/:id/*` et `/api/photos/*` vérifie que la livraison appartient au livreur connecté (`driverId === JWT sub`).
- **Certificats (juin 2026)** : `GET /certificates/:receiptId` exige un Bearer livreur (propriétaire), gestionnaire, ou un jeton signé `?access=` (90 jours, inclus dans l’URL e-mail et les nouveaux certificats).
- **JWT unifié (juin 2026)** : module `server/config/jwt.ts` — une seule clé pour livreur, gestionnaire et certificats ; validation au démarrage (`NODE_ENV=production` → secret ≥ 32 car., pas de valeur par défaut).
- **Bypass prod (juin 2026)** : `server/config/production.ts` — refus de `GEOFENCE_BYPASS`, `OTP_CODE`, `DRIVER_PIN` en production ; OTP aléatoire, pas de `devOtpCode`.
- **OTP + rate limiting (juin 2026)** : max 5 tentatives OTP puis verrouillage ; rate limit login (10/15 min), send-otp (20), confirm-otp (30), refresh (60).
- **Doublons replan (juin 2026)** : à la création d’une tournée replanifiée, `replannedFromTourId` clôture les arrêts non livrés de l’ancienne tournée ; fusion chauffeur n’affiche que la dernière tournée (+ livraisons déjà faites).
- **CORS (juin 2026)** : `server/config/cors.ts` — dev permissif, production limitée à `PUBLIC_BASE_URL` et `CORS_ORIGINS`.
- **Replan livraison partielle (juin 2026)** : bouton Replanifier sur tâche partielle → template avec quantités refusées (`GET /dashboard/deliveries/:id/partial-replan-template`).
- **Suivi qté détaillée (juin 2026)** : colonne Qté affiche « Produit N unités » comme la modale détail.
- **Auth gestionnaire HttpOnly (juin 2026)** : cookie `manager_token`, endpoints `/auth/me` et `/auth/logout-dashboard` ; Bearer conservé pour scripts.

### Pistes sécurité (non planifiées)

1. ~~Protéger les certificats~~ (fait).
2. ~~Unifier et imposer `JWT_SECRET` fort au démarrage~~ (fait).
3. ~~Rate limiting login / OTP + verrouillage après N échecs OTP~~ (fait).
4. ~~Restreindre CORS au domaine de production~~ (fait).
5. ~~Cookies `HttpOnly` pour le token gestionnaire~~ (fait).
6. ~~Multi-tenant si plusieurs entreprises sur la même instance.~~ **En cours / socle livré (juillet 2026)** — `companies` + `company_id`, inscription `/manager/register`, ops `GET /admin/ops-status`. Voir `docs/MULTI-TENANT.md`.
7. ~~Désactiver strictement tous les bypass et codes fixes en production~~ (fait).
