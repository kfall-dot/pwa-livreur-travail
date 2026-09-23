# Invariants E2E — ce que la non-régression garantit

`npm run regression` **ne prouve pas l’absence de bugs**. Elle vérifie que les **invariants listés ci-dessous** tiennent encore après une modification.

Quand un bug utilisateur est corrigé : **ajouter une ligne ici + un test Playwright** (puis incrémenter `MIN_E2E_TESTS` dans `scripts/regression.sh` si nouveau test).

---

## Ce que la suite garantit

| Zone | Fichier spec | Risque couvert |
|------|--------------|----------------|
| Environnement dev | `00-dev-setup.spec.ts` | API JSON vide, proxy Vite mort, seed produits, reset auth + confirmation, login téléphone local CI |
| Auth livreur | `auth.spec.ts` | Login, tableau de bord, **unités affichées (caisses ≠ palettes)** |
| Parcours livraison | `delivery-flow.spec.ts` | Start → photos → déclaration → OTP → confirmation ; annulation |
| Manager | `manager-replan.spec.ts` | Replan / Annuler ; **édition tournée → refresh Planifier + Suivi** ; **suppression tournée** |
| Démo publique (QR) | `demo-entry.spec.ts` | Entrée auto livreur + gestionnaire, session démo |
| Achats chantier BTP | `btp-procurement.spec.ts` | WhatsApp → EB → DT/DAF/SA → BC → livraison |

---

## Invariants métier (matrice)

Chaque ligne = une règle que les tests doivent empêcher de recasser.

| ID | Invariant | Spec / test |
|----|-----------|-------------|
| I01 | Login livreur avec PIN démo → tableau de bord | `auth.spec` — connecte avec PIN valide |
| I02 | Unité planifiée **caisse** visible chez le livreur (**pas** « palette ») | `auth.spec` — `delivery-card-del-2` contient « 4 caisses » |
| I03 | Parcours livraison complet sur `del-1` | `delivery-flow.spec` — parcours start → OTP |
| I04 | Annuler depuis photos remet la livraison à démarrer | `delivery-flow.spec` — annulation depuis photos |
| I05 | Replan Annuler vide le formulaire / retourne au bon onglet | `manager-replan.spec` — annuler replan… |
| I06 | Modifier une tournée (Planifier) → Suivi affiche le changement | `manager-replan.spec` — modifier une tournée… |
| I07 | Modifier depuis Suivi → Suivi recharge **sans** changer la date | `manager-replan.spec` — modifier depuis Suivi… |
| I08 | API / seed / reset admin | `00-dev-setup.spec.ts` |
| I09 | Arrêt **Livré** → quantité livrée visible (livreur + manager) | `manager-delivered-detail.spec.ts` + `npm run test:unit` |
| I10 | `/admin/reset` et `/admin/seed` exigent auth (ADMIN_API_TOKEN ou manager) | `00-dev-setup` — reset sans token → 401 |
| I11 | Login livreur accepte `070…` local (normalisation serveur → `+225…`) | `00-dev-setup` — login-driver numéro local CI |
| I12 | `POST /deliveries/:id/declare` refuse un corps invalide (ex. `lines: []`) | `00-dev-setup` — declare validation serveur |
| I30 | `POST /deliveries/:id/declare` refuse si statut encore **pending** (démarrer d’abord) ; l’UI rappuie `start` avant declare | `00-dev-setup` — declare pending + `DeliveryPage` |
| I13 | Arrêt de tournée **doit** référencer un point actif du catalogue (`supermarketId`) | `00-dev-setup` — POST tours sans supermarketId → 400 |
| I14 | OTP SMS utilise le **téléphone du catalogue** si l’arrêt n’en a pas (ou copie obsolète) | `00-dev-setup` — send-otp après téléphone catalogue + arrêt vide |
| I15 | En production (`CONTEXT=production`), OTP **aléatoire** (jamais `123456` / pas de `devOtpCode`) | `server/config/production.test.ts` |
| I16 | Bouton **Renvoyer** OTP ne demande pas de re-déclarer les quantités | `delivery-flow.spec` — après 1er OTP, Renvoyer sans message déclaration |
| I17 | Livraison **partielle** → badge **Partielle** (pas « Livrée ») côté livreur | `delivery-flow.spec` — livraison partielle → badge Partielle |
| I18 | Création tournée → SMS livreur + redirection **Suivi** + `orderRef` auto `CMD-YYYYMMDD-XXXX` | `manager-replan.spec` + `00-dev-setup` — POST tours sans orderRef |
| I19 | Lien certificat e-mail / manager → page HTML (`view=html` + jeton), **pas** page login | `manager-delivered-detail.spec` — certificat HTML |
| I20 | Livreurs avec **plusieurs tournées** le même jour voient **tous** les arrêts actifs (pas seulement la dernière) | `auth.spec` — multi-tournées même jour |
| I21 | Liste des livraisons affichée dès la réponse API (OSRM/géocode ne bloquent pas le tableau de bord) | `TourContext` + compteur `driver-stop-count` |
| I22 | Manager peut **supprimer** une tournée sans arrêt livré → disparaît de Suivi et Planifier | `manager-replan.spec` — supprimer une tournée… |
| I23 | Chaque entreprise ne voit que ses données ; `POST /auth/register-company` crée un espace isolé | `00-dev-setup` — register-company isole les listes |
| I24 | `/manager/register` affiche le formulaire d’inscription (pas redirection silencieuse vers l’app livreur) | `00-dev-setup` — /manager/register affiche le formulaire |
| I25 | Ajout livreur avec téléphone déjà pris → **409** clair (CI / prod). En **netlify:dev** local, le numéro peut être réutilisé | `00-dev-setup` — create driver téléphone dupliqué |
| I26 | Login livreur : saisie téléphone bornée à **10 chiffres** nationaux, **sans débordement** du champ | `auth.spec` — saisie téléphone 10 chiffres sans débordement |
| I27 | Désactiver un chantier **persiste** après rechargement (API + UI manager) ; le seed/reconcile ne réactive pas | `manager-supermarket-active.spec` |
| I28 | Isolation multi-entreprises : un gestionnaire d’une autre entreprise reçoit **404/403** (jamais 200) sur photos, gabarit de replan, PATCH produit, photo-par-clé d’une entreprise tierce | `manager-multitenant-authz.spec` |
| I29 | Arrêt non terminé sur **date passée** → libellé **Date passée** (pas « À venir ») ; pas de statut DB `expired` | `src/lib/deliveryAccess.test.ts` |
| I31 | QR démo : `/demo/livreur` et `/demo/manager` servent un **diaporama statique** (captures d’écran) — **aucune** connexion API ni session réelle | `demo-entry.spec.ts` |
| I32 | Visite guidée démo enchaîne tournée → carte → **parcours livraison complet** (start, photo, déclaration, OTP) | `demo-entry.spec.ts` |
| I33 | Message WhatsApp simulé → brouillon EB parsé (lignes quantité/unité/libellé) | `btp-procurement.spec.ts` |
| I34 | Circuit achats BTP : DT soumet EB **au SA** → SA chiffre → **CdG** approuve (NIP) → DAF (puis PDG si ≥ 500k) → SA crée BC → `po_ready` | `btp-procurement.spec.ts` |
| I35 | Après `po_ready`, planification livraison crée une **tournée** pour le livreur BTP pilote | `btp-procurement.spec.ts` |
| I36 | Document BC HTML calqué sur le bon de commande papier (quantité, PU, TVA, TOTAL TTC, autorisation) | `btp-procurement.spec.ts` |
| I37 | Collage message WhatsApp (DT) → brouillon EB **multi-lignes** → enregistrement **sans** « Brouillon introuvable » | `btp-procurement.spec.ts` |
| I38 | SA **ne voit pas** les brouillons EB non soumis (pas de collage / boîte EB) | `btp-procurement.spec.ts` |
| I39 | Login **DT** ouvre l’espace **Achats** (Boîte EB / Demandes) + entrée sidebar **Suivi chantier** (pas d’onglet Suivi chantier dans Achats ; pas Planifier / Catalogue / Suivi BC) ; **SA** a Achats + **Planifier** + **Catalogue** + **Équipe** + **Tâches** + **Suivi** (registre BC), pas Suivi chantier ; **CdG** ouvre **Achats** + **Suivi chantier** | `btp-procurement.spec.ts` |
| I40 | Premier login **DT/SA** en dev (`netlify:dev` / `ALLOW_SEED`) **crée** les comptes pilote ; `manager@demo.fr` reste accepté même si le seed a renommé l’admin local | `btp-procurement.spec.ts` |
| I41 | Message WhatsApp **informel** (de, « une tonne », fer 8/14, chantier, demain) → brouillon EB **3 lignes** | `btp-procurement.spec.ts` |
| I42 | EB générée = **FICHE DE BESOIN ACHAT** (SERVICE Direction Technique, fournisseur/paiement **par ligne**, demandeur saisi, VALIDE PAR = DT, signature NIP) | `btp-procurement.spec.ts` |
| I43 | Bouton **fiche EB vierge** (DT) → formulaire officiel vide (EXPRESSION DU BESOIN, SITE non prérempli, objet/date de besoin éditables, demandeur et lignes vides) ; bouton **Valider** (pas Approuver) ; TRAITE PAR / VALIDE PAR = tableau NOM · DATE · SIGNATURE · DAF | `btp-procurement.spec.ts` |
| I44 | DT soumet → copie **SA** seulement (pas le DAF) ; SA seul chiffre PU (montant = PU × qté) ; **PJ par ligne** avant CdG ; envoi SA **< 500 000 XOF** → statut `cdg_review` (DAF ne voit pas encore) ; CdG approuve → `daf_review` | `btp-procurement.spec.ts` |
| I45 | Total **≥ 500 000 XOF** → soumission SA envoie au **CdG** (pas DAF/PDG) ; après NIP CdG → copie **DAF et PDG** (`daf_review`) ; fiche EB affiche une **case PDG** ; DAF puis PDG **Approuver** avec **NIP** → cases DAF/PDG affichent **NIP vérifié** | `btp-procurement.spec.ts` |
| I46 | Sections **TRAITE PAR** (SA) et **VALIDE PAR** (DT) identiques entre fiche DT et fiche SA (NOM / DATE / SIGNATURE + **une** case DAF sur toute la hauteur ; PDG si ≥ 500 000) | `btp-procurement.spec.ts` |
| I47 | SA peut modifier **fournisseur** (liste du référentiel) et **mode de paiement** sur chaque ligne EB (avant envoi CdG) | `btp-procurement.spec.ts` |
| I48 | SA peut **retirer** une pièce jointe avant envoi CdG | `btp-procurement.spec.ts` |
| I49 | Joindre / retirer une PJ **ne vide pas** PU, montant, fournisseur ni paiement saisis (même non enregistrés) | `btp-procurement.spec.ts` |
| I50 | Cliquer une PJ **ouvre l’aperçu** (PDF/image) dans la page, avec téléchargement — pas un onglet bloqué | `btp-procurement.spec.ts` |
| I51 | Après CdG, DAF (ou PDG) **instruit le dossier** (PU, montant, PJ consultable) puis **Approuver** avec **NIP** ; le bloc sheet1 **DAF** se remplit (nom + NIP vérifié, **sans doublon**) ; historique **DAF — Montant approuvé** ; SA **émet le BC** (**Créer le BC** s’il n’y a qu’un fournisseur ; **Créer les BC** sinon ; **Créer les BC** inactif une fois tous générés) | `btp-procurement.spec.ts` |
| I52 | Clic **Planifier une tournée** (SA, BC prêt) ouvre l’écran Planifier **prérempli** (**fournisseur** du BC, arrêt = chantier) en **mode saisie** ; **pas** de champs Livreur / Date sur Achats | `btp-procurement.spec.ts` |
| I53 | Suppression d’une tournée liée à un BC → demande de nouveau `po_ready` ; le SA peut recréer une tournée | `btp-procurement.spec.ts` |
| I54 | Collage WhatsApp corrige les fautes courantes (`simen` → ciment) | `btp-procurement.spec.ts` |
| I55 | SA **ne peut pas** envoyer au CdG si fournisseur, mode de paiement ou PJ manque sur une ligne | `btp-procurement.spec.ts` |
| I56 | Catalogue : les **chips** de `CatalogueTab` (Produits / Fournisseurs / Catégories & unités / Chantiers) sont les **seuls** points d’entrée de la section ; chip **Chantiers** avec colonne **Type** (Privé / Public) éditable via « Modifier » et **persisté** après rechargement ; chip **Fournisseurs** (ID auto, raison sociale, adresse, contact, famille, statut, note) | `catalog-chantiers.spec.ts` |
| I57 | Mode **COMPTANT** → bon de trésorerie (fiche « Demande d’avance de trésorerie ») généré et **joint avant** l’envoi au CdG ; **N° de l’avance** vide ; après CdG puis approbation DAF, signatures DAF/PDG reportées sur le BT | `btp-procurement.spec.ts` |
| I58 | SA peut **émettre un BC par fournisseur** présent sur l’EB (bouton **Créer les BC** = tous les fournisseurs) | `btp-procurement.spec.ts` |
| I59 | Si le mode de paiement n’est **plus COMPTANT**, la section **bon de trésorerie** disparaît | `btp-procurement.spec.ts` |
| I60 | **Créer les BC** génère un BC par fournisseur ; le SA peut **planifier une tournée par BC** (`po_ready` tant qu’un BC n’a pas de tournée) | `btp-procurement.spec.ts` |
| I61 | Les produits présents dans l’EB sont **ajoutés au catalogue Produits** à la soumission DT | `btp-procurement.spec.ts` |
| I62 | Unité **tonne** de l’EB est conservée sur la tournée livreur (pas convertie en colis) | `btp-procurement.spec.ts` |
| I63 | SA : onglet **Suivi** = registre POINTS FOURNISSEURS (colonnes Excel, **mois** filtrable + **RECAP** un tableau par fournisseur) ; montants en **XOF** sans suffixe CFA ; DOC EN ATTACHE consultable ; FACTURE/JUSTIFS/OBSERVATION/VÉRIFICATION éditables par le SA | `btp-procurement.spec.ts` |
| I64 | DT : sidebar **Suivi chantier** affiche le **stock disponible** (quantités livrées acceptées) par chantier / produit ; après confirmation livreur, l’EB passe à **Livré** (plus « Livraison planifiée ») | `btp-procurement.spec.ts` |
| I65 | Unité **botte** (fer) de l’EB est conservée sur la tournée livreur (pas convertie en colis) | `btp-procurement.spec.ts` |
| I66 | **CdG** gèle un budget initial > 0 → `GET budget` retourne ce montant, `budgetFrozenAt` non null ; un second gel → **409** | `btp-procurement.spec.ts` |
| I67 | DT, DAF, SA, PDG **ne peuvent pas** geler ni modifier `budget_initial` (403) | `btp-procurement.spec.ts` |
| I68 | Avenant : DT crée le `draft`, **DAF** approuve → `budget_initial` inchangé ; `budgetTotal = initial + Σ avenants approved`. CdG **ne peut pas** créer le `draft` ni l’approuver (403). PDG **ne peut pas** approuver (403) | `btp-procurement.spec.ts` |
| I69 | Avenant de baisse qui rendrait `budget_total < engagé` → **400** | `btp-procurement.spec.ts` |
| I70 | `reste_à_engager = budget_total − Σ BC validés` du chantier ; un BT seul ne compte pas | `btp-procurement.spec.ts` |
| I71 | Isolation tenant : manager d’une autre entreprise → **404** sur le budget du pilote | `btp-procurement.spec.ts` |
| I72 | SA crée un BC qui dépasse le reste → **warning** `overBudget` ; le BC est **quand même** créé (D-F01-3) | `btp-procurement.spec.ts` |
| I74 | CdG : % d’engagement, écart XOF/%, feux 2 % / 5 %, **avenant manquant** et date de 1er franchissement après un BC hors enveloppe ; tableau multi-chantiers sur Suivi chantier | `btp-procurement.spec.ts` |
| I75 | Accueil **CdG Achats** : file du jour (à valider, enveloppes non gelées, avenant manquant, pipeline hors BC) ; clic enveloppe ouvre **Suivi chantier** | `btp-procurement.spec.ts` |
| I76 | CdG : chaque indicateur Koestrem (réalisé livraisons cumulées, écart réalisé–budget, part matériaux / **budget total**, 3 premiers postes / budget initial) a une page de calcul quotidien | `btp-procurement.spec.ts` |
| I77 | DT : à la création de l’EB, chaque ligne a une **catégorie** matériaux 5.1 (menuiserie, peinture, électricité, ciments…) persistée ; le titre de colonne est **Catégorie** (plus « Poste ») | `btp-procurement.spec.ts` |
| I78 | DT : après soumission d’une EB, le compteur **Demandes actives** (accueil Achats / Boîte EB) est **> 0** | `btp-procurement.spec.ts` |
| I79 | Seed BTP : chantiers et fournisseurs du fichier **POINTS FOURNISSEURS DES BC NEWS** sont dans le catalogue TraceO (Chantiers + Fournisseurs) | `btp-procurement.spec.ts` |
| I80 | Unité **seau** de l’EB est conservée sur la tournée (pas convertie en colis ni palette) | `btp-procurement.spec.ts` |
| I81 | SA : le **n° de facture** saisi sur Suivi BC survit à un changement d’onglet **et** est persisté en base (le registre n’est plus remonté à chaque bascule) | `btp-invoice-cmpt.spec.ts` |
| I82 | SA : **Transmettre** reste verrouillé tant que le n° **et** la copie de facture (PDF/image) ne sont pas fournis ; après transmission → pastille **✓ Transmis** (`invoiceTransmitted = true`), conservée après changement d’onglet | `btp-invoice-cmpt.spec.ts` |
| I83 | CMPT : la facture transmise apparaît **Reçu** dans l’onglet **Factures**, copie consultable en aperçu, paiement **Oui/Non** persistant — et **aucun** champ de saisie du registre SA n’est monté côté comptable | `btp-invoice-cmpt.spec.ts` |
| I84 | Rôle comptable : lecture du registre + de la copie facture et **paiement** autorisés ; **joindre/transmettre** une facture refusé (**403**, réservé au SA) | `btp-invoice-cmpt.spec.ts` |
| I85 | CMPT : l’espace n’expose que **Comptabilité** (ni Achats ni Suivi BC) ; KPI du mois = BC livrés / factures saisies ; suivi filtrable par mode de paiement | `btp-invoice-cmpt.spec.ts` |
| I86 | CdG **Suivi chantier** : la tuile **Total engagé** = Σ `engagedFcfa` serveur (tous chantiers) et **suit** un BC émis par le SA après « Actualiser » **et** après un aller-retour d’onglet (aucune donnée figée sur le premier chargement) | `btp-procurement.spec.ts` |
| I87 | **Demande d’avance de trésorerie** : tableau chiffré **Objet → Quantité → Prix unitaire → Montant** ; en COMPTANT ≥ seuil PDG, le **DAF** accède à la fiche depuis son dossier à valider (avis explicite : l’approbation vaut aussi validation du BT) et son approbation NIP appose la signature DAF, puis le **PDG** fait de même — les deux signatures coexistent sur le document | `btp-procurement.spec.ts` + `pdfDocuments.test.ts` |
| I88 | Manager : le **sous-nav catalogue** (boutons Chantiers / Fournisseurs / Catalogue produits / Unités de mesure, `mgr-tab-points`, `mgr-tab-fournisseurs`, `mgr-tab-produits`, `mgr-tab-unites`) **ne s’affiche plus** au-dessus des tuiles — les chips de `CatalogueTab` remplacent les anciennes pages `PointsTab` / `FournisseursTab` | `btp-procurement.spec.ts` |
| I89 | Barre latérale — ordre : **Livraisons** apparaît avant **Suivi** (registre BC, SA) et avant **Suivi chantier** (**DT / CdG / DAF / PDG**) dans la section *Gestion*, sur toutes les pages du dashboard — soit *Achats chantier → Livraisons → Suivi chantier* | `btp-procurement.spec.ts` |
| I90 | Catalogue → chip **Chantiers** : le **clic sur une ligne** ouvre la **fiche détaillée du chantier** (identité, coordonnées, interlocuteurs, encadrement achats, enveloppe, consommation, livraisons BC) ; le chantier achats est retrouvé par `sites.supermarket_id` (`GET /procurement/sites/by-supermarket/:id`) — un point non rattaché affiche « Aucun chantier achats relié » et les boutons *Modifier* / *Désactiver* de la ligne n'ouvrent pas la fiche | `catalog-chantiers.spec.ts` |
| I91 | Page **Livraisons** : à l'ouverture, la liste couvre **tout le mois courant** (en-tête « Livraisons de \<mois\> », colonne Date) ; le sélecteur de mois remonte les **mois passés**, « Filtrer » restreint à une **journée** et « Voir tout le mois » revient au mois ; le menu **Chantier** liste les chantiers ayant des **BC émis** (`GET /procurement/sites/with-bc`) — une livraison de BC reste listée car le rattachement passe par **tournée → BC → chantier** (`tours.purchase_order_id`), pas par `delivery_points.supermarket_id`. Les **tuiles** comptent la **période affichée** (mois ou jour, chantier inclus) et ne s'ajustent **pas** sur les chips *OTP bloqué / Écarts / Livrées* : ceux-ci filtrent le **tableau seul**, avec le **même classifieur** que les tuiles (`deliveryBucket`) — l'écart/refus (déclaration livreur) prime sur un statut d'arrêt « livré ». Les **chips de tournée** portent le **livreur seul** (le libellé « 02/09/2026 · Aya Livreur · 1 livraison » est **retiré**) et ne s'affichent qu'en **vue jour** — Modifier / Supprimer y vivent donc aussi —, et chaque libellé (Mois / Jour / Chantier) reste solidaire de son contrôle | `btp-procurement.spec.ts` |

---

## Régressions déjà corrigées (ne pas réintroduire)

| Bug | Symptôme | Verrouillage |
|-----|----------|--------------|
| Quantité livrée vide sur arrêt **Livré** | Consultation sans « 3 palettes » etc. | `src/lib/deliveredQuantity.test.ts` + I09 |
| Unité caisse → palette livreur | Manager caisses, livreur palettes | I02 |
| Édition tournée invisible | Suivi ne se rafraîchit pas | I06–I07 |
| PJ écrase le chiffrage SA | Joindre une PJ recharge le détail serveur et vide PU/montant | I49 |
| PJ non consultable | `window.open` après fetch → popup bloquée ; nom de fichier non cliquable dans le tableau | I50 |
| PJ introuvable après jointure | PDF binaire renvoyé en utf8 → proxy Netlify 500 « Could not proxy request » ; toast « Pièce jointe introuvable » | I44 GET octets + I50 |
| Saisie SA effacée sur **Suivi BC** / **Comptabilité** | Bascule d’onglet → registre remonté (`key={…}`) → n° facture, observation, vérification perdus | I81–I82 + `src/stores/procurementStore.ts` |
| Tuile **Total engagé** figée (CdG Suivi chantier) | BC émis par le SA → « Actualiser » et le retour d’onglet ne rechargeaient que les enveloppes : tuile, BC en cours et dépenses du mois restaient au premier chargement | I86 + `SuiviChantierTab` (jeton unique `dataToken`) |
| Fiche trésorerie sans chiffrage ni signature vérifiée bout en bout | L’objet fusionnait quantité/unité (pas de colonnes Quantité / Prix unitaire) et la chaîne DAF → PDG sur la fiche n’était testée que jusqu’au DAF (< seuil) | I87 + `pdfDocuments.ts` (5 colonnes) |
| Sous-nav catalogue redondant (4 boutons) au-dessus des tuiles | Les chips de `CatalogueTab` couvraient déjà Chantiers / Fournisseurs / unités : les boutons ne servaient qu’à revenir sur les anciennes pages `PointsTab` / `FournisseursTab` | I88 + `ManagerDashboardPage` (nav retirée) |
| Ordre barre latérale : **Suivi** (registre BC) / **Suivi chantier** affichés avant **Livraisons** | Le SA lisait *Achats chantier → Suivi → Livraisons* ; DT / CdG / DAF / PDG lisaient *Achats chantier → Suivi chantier → Livraisons* dans la section Gestion | I89 + `ManagerDashboardPage` (item `suivi` placé juste après *Achats chantier*) |
| Fiche chantier inaccessible depuis le catalogue | Le SA devait passer par *Suivi chantier* — dont les blocs (enveloppe, indicateurs, stock) sont réservés au DT / CdG / DAF / PDG — pour retrouver contacts, budget ou livraisons d'un chantier | I90 + `CatalogueTab` (ligne cliquable → `SiteDetailModal` + `GET /procurement/sites/by-supermarket/:id`) |
| Livraison **refusée** comptée « Livrée » (badge, tuiles, chips, filtre serveur) | Le formulaire livreur produit `rejected`, mais `deliveryBucket`, `lmStatus*` et `getDashboardDeliveries` ne testaient que `refused` (jamais produit) — un refus restait `delivered` | `src/lib/deliveryBucket.test.ts` + I91 |
| Navigation **mois** inversée en Comptabilité (CMPT) | Depuis septembre, « Suivant » ouvrait **août** : la liste serveur est triée du plus récent au plus ancien, mais `ComptabiliteTab` naviguait comme si elle était chronologique | `ComptabiliteTab` (`gotoNeighbor` : index − delta) + `btp-invoice-cmpt.spec.ts` |
| Boutons **Exporter** de l'onglet Rapports (CMPT) inertes | Les 4 lignes appelaient un placeholder qui ne faisait que recharger le registre : aucun fichier produit | `ComptabiliteTab` (`exportReport` → vrai classeur `.xls` par rapport) + `btp-invoice-cmpt.spec.ts` |
| Colonne **Livraisons 30 j** (catalogue, chip Chantiers) toujours à 0 | Valeur **codée en dur** au lieu du comptage réel des BC livrés du mois glissant ; le rattachement suit le **nom** du chantier achats relié au point | `CatalogueTab` (`bcRows` → comptage au chargement) — pas de test dédié : la seed e2e ne crée aucun BC livré |

Logique quantité livrée : **`src/lib/deliveredQuantity.ts`** uniquement (pas de copie dans les composants).

---

## Hors scope actuel (ne pas supposer couvert)

- **Parité manager ↔ Livraison :5175** — écarts documentés dans [`docs/MANAGER-PARITY-5175.md`](../docs/MANAGER-PARITY-5175.md) (déblocage OTP/reopen, filtres statut complets, géocodage… ; fraude reportée phase 2).
- Parité manager ↔ livreur pour **toutes** les unités (kg, plateau, unité…) — seule **caisse** est testée (I02).
- Parité **produits attendus** ligne par ligne (multi-produits) entre manager et livreur.
- Cache IndexedDB livreur après édition manager (rafraîchissement manuel).
- Édition d’arrêts **déjà livrés**.
- Performance, charge, sécurité hors rate-limit E2E.

Étendre la matrice quand un de ces points devient critique ou qu’un bug y est lié.

---

## Procédure après correction de bug

1. Identifier l’**invariant** en une phrase (« Si X côté manager, alors Y côté livreur »).
2. Ajouter ou étendre un test E2E (éviter les tests qui ne font qu’ouvrir une page).
3. Ajouter une ligne **Ixx** dans la matrice ci-dessus.
4. Lancer `npm run regression` — doit être vert.
5. Si nouveau test : `MIN_E2E_TESTS` dans `scripts/regression.sh`.

---

## Chemins API à garder en tête

| Rôle | Chargement tournée | Piège connu |
|------|-------------------|-------------|
| Livreur | `GET /tours/by-date/:date` → `adaptLivraisonToday` | `planned_unit` / `mapUnitType` — régression I02 |
| Livreur | `GET /deliveries/:id` | `plannedUnit` pour la déclaration |
| Manager Suivi | `GET /dashboard/deliveries` | Refresh après PATCH tournée — régression I06–I07 |

Les tests doivent exerciser le **même chemin** que l’utilisateur (pas seulement l’API brute sans adaptateur front).
