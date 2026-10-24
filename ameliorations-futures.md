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

> Cadrage actualisé le 24 octobre 2026. Le mode holding reste à implémenter ; cette section décrit la cible, pas les capacités actuellement disponibles. Les choix restant à confirmer sont signalés ci-dessous.

### Contexte et périmètre

La holding comprend 4 filiales : BTP, hôtellerie, sécurité et agriculture, chacune avec sa raison sociale propre. Les compagnies émettent leurs EB avec le formulaire existant ; le BTP conserve aussi son entrée WhatsApp/chantier. Les demandes convergent vers un SA central et suivent les circuits de validation applicables à leur origine.

Les fonctions centrales couvrent le SA, le CdG, le DAF, le PDG, la Comptabilité (CmPT) et la **Trésorerie**. Les opérationnels restent limités à leur compagnie et à leurs chantiers autorisés. Les vues Achats, Livraisons, Suivi BC, Suivi chantier, Comptabilité, Trésorerie et Rapports doivent respecter ce périmètre.

Le socle actuel isole les entreprises avec un `companyId` de session et des filtres par compagnie. La cible ajoute un périmètre de groupe explicitement autorisé, sans supprimer cette séparation.

### Règles métier à conserver

- Chaque EB porte une **compagnie émettrice explicite**, distincte de son auteur. Le SA central peut créer une demande pour une filiale autorisée ; la compagnie du compte connecté ne détermine pas automatiquement celle de la dépense.
- Le `companyId` de l'EB est conservé sur ses BC, BT, livraisons, factures et paiements. Les liens entre ces objets doivent appartenir à la même compagnie. Aucun changement silencieux de compagnie après engagement des documents aval.
- Les enveloppes, dépenses, engagements, règlements et soldes fournisseurs restent **séparés par compagnie**. Une vue consolidée ne constitue pas un budget commun ni une autorisation de financement entre filiales.
- Le SA central conserve son **chef et ses adjoints**. Le chef valide les montants et les BC préparés par ses ressources ; son NIP et sa signature s'appliquent à l'étape prévue pour le BC. Ses propres actions ne passent pas par cette validation d'équipe. Les verrous de prise en charge restent applicables à l'équipe SA.
- Les EB créées par le SA conservent leur parcours sans validation DT ; les EB issues des opérationnels conservent leur circuit applicable. Le mode holding ne remet pas toutes les demandes dans un circuit unique indifférencié.
- Les règles de retour pour correction et de refus sont conservées : **seuls le DAF et le PDG peuvent prononcer un refus définitif** à ce stade ; celui du CdG reste à confirmer avec le client.
- La transmission des demandes de matériaux alimente la Comptabilité et la Trésorerie. Cette dernière accède au dossier EB et à sa chaîne documentaire, avec toutes les pièces jointes autorisées, avant paiement, comme pour la main d'œuvre.
- **Seule la Trésorerie marque une facture payée**, via l'action de paiement « À payer ». Le statut doit être identique dans toutes les vues ; aucun indicateur modifiable par le SA ne doit contourner cette règle.
- Le stock et les consommations restent rattachés au chantier et à sa compagnie : disponible = quantités réceptionnées acceptées − consommations enregistrées. Les livraisons prévues sont séparées du disponible. Les transferts entre filiales ne sont pas implicitement autorisés par le mode holding.

### Accès et sécurité

- Les rôles centraux disposent d'un périmètre couvrant les compagnies autorisées de **leur holding**, pas toutes les entreprises de la plateforme. Les opérationnels conservent leur périmètre de compagnie et de chantier.
- Une politique serveur commune résout les compagnies autorisées à partir de l'identité, du rôle et du rattachement au groupe. Un sélecteur de compagnie, un identifiant d'objet ou un paramètre envoyé par le navigateur ne constitue jamais une autorisation.
- Le remplacement de `eq(companyId)` par `inArray(...)` ne suffit pas : vérifier le périmètre et les droits métier pour chaque liste, détail, création, modification, validation, document, pièce jointe, téléchargement et export.
- Vérifier aussi les relations entre objets : un fournisseur, un chantier ou une facture d'une autre compagnie ne peut pas être associé simplement parce que le rôle central voit les deux compagnies.
- Les changements de rôle ou de périmètre doivent invalider ou faire réévaluer les droits de session ; un JWT ancien ne doit pas conserver indéfiniment des accès révoqués.
- L'audit conserve l'auteur, son rôle, la compagnie de l'objet et l'action. `security_audit_events.companyId` désigne la compagnie de l'objet, pas celle du lecteur.

### Données, documents et numérotation

- Ajouter `holdings` et `companies.holding_id`. Enrichir chaque compagnie : raison sociale, sigle, adresse, contacts, logo, informations légales nécessaires et préfixe de numérotation (`BTP/HOT/SEC/AGR` à confirmer).
- Les documents EB/BC/BT et exports portent l'identité de la compagnie émettrice ; la signature du responsable central ne remplace pas cette identité.
- Sécuriser la numérotation avant remise au client : allocation atomique et contrainte d'unicité, avec périmètre explicite compagnie/type de document/exercice. Le nettoyage final des données de test est un moment adapté pour initialiser les séries définitives ; aucun numéro déjà émis ne doit être réattribué ensuite.
- Préparer une migration et une vérification des données existantes, sans élargissement silencieux des accès. Le rattachement des compagnies de démonstration et de pilote au groupe de test doit être explicite ; elles ne sont pas automatiquement reprises dans la holding du client.
- Une table d'exceptions telle que `manager_company_scopes` peut être prévue pour les besoins futurs (ex. DT intervenant dans deux filiales), sans rendre ces exceptions obligatoires au premier lot.

### Interface

- Sélecteur global « Toutes (holding) » et raisons sociales autorisées pour les rôles centraux ; les opérationnels restent limités à leur périmètre.
- Compagnie émettrice obligatoire à la création d'une EB ; affiche clairement cette identité dans le dossier, ses documents et les étapes de validation/paiement.
- Colonne « Compagnie » dans les files et exports concernés, y compris Trésorerie ; indicateurs calculés sur le périmètre sélectionné.
- Chantiers, stocks, budgets et données financières filtrés par compagnie. Le changement de sélection recharge les listes et évite de conserver des choix de formulaires incompatibles avec la nouvelle compagnie.

### Points à confirmer avec le client

- **Fournisseurs** : annuaire commun à la holding ou fiches séparées ? Recommandation : identité fournisseur partageable avec rattachements par compagnie ; factures, règlements et soldes restent séparés dans tous les cas.
- Raisons sociales et mentions documentaires définitives, préfixes et format de numérotation.
- Comptes centraux autorisés, éventuelles restrictions de certains adjoints à certaines filiales, et rattachement des opérationnels.
- Besoin éventuel de transferts de matériaux ou de financements entre filiales : hors périmètre initial tant que leurs règles ne sont pas définies.

### Réalisation progressive et critères de validation

| Lot | Contenu | Validation attendue |
|---|---|---|
| 1 | Groupe, compagnies, identité légale, compagnie émettrice, numérotation et migration préparée | Les données existantes restent rattachées à leur compagnie ; aucune ouverture d'accès implicite |
| 2 | Politique d'autorisation commune, périmètres centraux/opérationnels, contrôle des relations et audit | Tests positifs et négatifs sur API, pièces jointes, documents, exports et actions ; isolation entre holdings |
| 3 | Sélecteur, colonnes, indicateurs, documents et adaptations des circuits SA/Trésorerie | Parcours complet avec **une deuxième compagnie pilote** : EB → validations applicables → BC → réception → facture → paiement |
| 4 | Régression et ouverture progressive aux autres filiales | Visibilité centrale correcte, invisibilité pour les opérationnels des autres filiales, budgets/stock/soldes séparés et statut payé uniforme |

Étendre les tests d'autorisation multi-entreprises et `e2e/INVARIANTS.md` pour couvrir aussi les téléchargements directs, les accès par identifiant, les relations entre compagnies, les droits révoqués, la concurrence de numérotation et les validations du chef SA. Vérifier que seuls les paiements de Trésorerie mettent à jour les factures comme payées.

### Statut

**Cadrage initial : 24 septembre 2026. Actualisation : 24 octobre 2026. Non implémenté.** Commencer par une deuxième compagnie pilote et son parcours complet avant d'ouvrir les quatre filiales. Les points à confirmer ci-dessus ne sont pas des décisions client déjà acquises.

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
