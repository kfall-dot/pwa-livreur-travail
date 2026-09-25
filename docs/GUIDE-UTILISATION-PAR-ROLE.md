# Guide d'utilisation par rôle — TraceO® (pilote BTP, société unique)

Document à remettre avec l'application. Il décrit, pour chaque rôle, **où se connecter, ce que l'on voit et les actions possibles** — et uniquement celles-là.

> Périmètre : pilote BTP, une seule société. Le mode holding multi-compagnies n'est pas couvert par ce guide.
> Conventions : EB = expression de besoin · BC = bon de commande · BT = bon de trésorerie (avance) · SA = service achats · CdG = contrôle de gestion · DAF = directeur administratif et financier · PDG = président-directeur général · CmPT = comptable.

---

## 1. Vue d'ensemble — qui fait quoi

| Étape du circuit | Rôle acteur | Action |
|---|---|---|
| 1. Émission de l'EB | Chef de chantier (formulaire vierge) ou DT (déboursé sec) ; terrain via WhatsApp | Crée / soumet le besoin |
| 2. Validation métier | DT (Directeur technique) | Valide l'EB (quantités, produits, catégories) |
| 3. Chiffrage + BC | SA (Service achats) | Chiffre, choisit le fournisseur, émet le BC, planifie la livraison |
| 4. Contrôle financier | CdG (Contrôle de gestion) | Approuve après chiffrage SA |
| 5. Validation montant | DAF | Approuve le montant (seuil 500 000 FCFA sur montant final BC) |
| 6. Validation haute | PDG (si montant ≥ seuil) | Approbation finale |
| 7. Livraison | Livreur (PWA mobile) | Démarre, photographie, déclare, fait valider par OTP |
| 8. Suivi terrain | Contrôleur chantier | Suit les livraisons et l'état des chantiers |
| 9. Facture + paiement | SA (saisie + transmission) puis CmPT (réception + paiement) | Clôture financière |

Cas particulier **BT** (fournisseur sans compte) : le dossier validé comprend **BC + BT + facture pro forma**, et la photo du BC n'est envoyée au fournisseur (WhatsApp) **qu'après** validation DAF/PDG.

---

## 2. Livreur (application mobile PWA)

**Connexion :** écran d'accueil → téléphone `+225` + PIN à 4 chiffres. Application installable (mode hors ligne partiel : la tournée reste consultable ; l'OTP et l'envoi de photos exigent le réseau).

**Actions possibles :**
- Choisir la date et actualiser sa tournée ; suivre la carte d'itinéraire.
- Pour chaque arrêt : **Démarrer** (contrôle de proximité ~200 m), **prendre les photos** requises, **déclarer** les quantités — livraison **complète**, **partielle** (quantités acceptées / refusées par produit + motif) ou **refusée**.
- **Envoyer le code OTP** au téléphone du responsable du point, **saisir le code** reçu, **confirmer** (contrôle ~100 m) → certificat généré.
- **Annuler** depuis l'étape photos (retour à « à démarrer »).
- Consulter un arrêt déjà clôturé (quantités attendues / livrées) et ouvrir son certificat.

**Ce qu'il ne peut pas faire :** modifier la tournée, voir d'autres livreurs, accéder aux prix, aux budgets ou aux factures.

---

## 3. Chef de chantier (site_manager) — « Ma journée »

**Connexion :** `/manager/login` (e-mail + mot de passe) → page d'accueil **« Ma journée »** (dossier quotidien de son chantier).

**Ce qu'il voit :** son chantier du jour, les dossiers en cours, l'historique des rapports, les photos de chantier, les indicateurs de son périmètre (dossiers, historique, photos).

**Actions possibles :**
- **Émettre une EB** via le **formulaire vierge** (produits, quantités, unités, urgence) pour les besoins courants d'exécution.
- Consulter l'état d'avancement de ses demandes (soumise, validée, BC émis, livrée).
- Consulter le suivi de son chantier (blocs autorisés : dossiers du jour, historique, photos).

**Ce qu'il ne peut pas faire :** valider une EB, chiffrer, émettre un BC, voir les autres chantiers, voir les budgets/enveloppes (réservés DAF/CdG/PDG).

---

## 4. DT — Directeur technique (technical_director)

**Connexion :** `/manager/login` → espace **Achats chantier**, page **Livraisons** et **Suivi chantier**.

**Ce qu'il voit :** les EB à valider, les livraisons du mois (vue mensuelle par défaut, filtre par jour, filtre chantier, filtres OTP bloqué / Écarts / Livrées), le suivi chantier complet (dossiers, stock réel, affectation chef/DT, historique, photos).

**Actions possibles :**
- **Émettre l'EB de déboursé sec** au lancement d'un chantier (formulaire vierge, ventilation en lignes produits obligatoire : quantité, unité, montant).
- **Valider les EB** (brouillons terrain issus de WhatsApp, demandes courantes) : quantités, produits, catégories matériaux.
- **Soumettre au SA** après validation métier.
- Suivre les livraisons (badges Livrée / Écart / Refusée, photos livreur, déclarations) et traiter les alertes de livraison partielle (EB complément ou escalade SA).
- Gérer le **stock chantier** (seuils, journal quotidien) et **affecter** chef de chantier / DT superviseur.

**Ce qu'il ne peut pas faire :** chiffrer et émettre un BC (SA), approuver financièrement (CdG/DAF/PDG), saisir ou payer une facture (SA/CmPT).

---

## 5. SA — Service achats (purchasing)

**Connexion :** `/manager/login` → espace **Achats chantier** (accueil, file des demandes), **Livraisons**, **Suivi BC**, catalogue (Chantiers, Fournisseurs, Produits, Unités), Planifier, Équipe, Tâches.

**Ce qu'il voit :** toutes les EB validées par le DT, les BC émis, les livraisons (mois + jour + chantier), le registre BC du mois (montants, factures, observations, vérifications), les catalogues.

**Actions possibles :**
- **Chiffrer** les lignes d'une EB (prix unitaires, montants) et la soumettre au circuit financier.
- **Choisir le fournisseur**, **émettre le BC**, puis **planifier la livraison** (créer la tournée : livreur, dépôt, arrêts depuis les points catalogue).
- **Suivi BC** : saisir le **n° de facture**, **joindre la copie** (PDF/image), renseigner observation et vérification, puis **Transmettre au comptable** (verrouillé tant que n° + copie manquent).
- Suivre les livraisons : filtres OTP bloqué / Écarts / Livrées, détail par livraison (déclaration + photos livreur), replanifier un reliquat partiel.
- Gérer les catalogues (chantiers, fournisseurs, produits, unités de mesure) et consulter la fiche détaillée d'un chantier (clic sur la ligne : identité, encadrement, enveloppe, consommation, livraisons BC).
- Exporter le registre (tableur).

**Ce qu'il ne peut pas faire :** approuver financièrement (CdG/DAF/PDG), marquer une facture payée (CmPT), valider sa propre facture côté comptabilité.

---

## 6. CdG — Contrôle de gestion (controle_gestion)

**Connexion :** `/manager/login` → espace **Achats chantier** (accueil : file du jour), **Livraisons**, **Suivi chantier**.

**Ce qu'il voit :** la file des demandes à valider, les enveloppes non gelées, les avenants manquants, le pipeline hors BC, les indicateurs consolidés (réalisé livraisons cumulées, écart réalisé–budget, part matériaux, top postes), les livraisons du mois.

**Actions possibles :**
- **Approuver** les demandes chiffrées par le SA (étape `cdg_review` → `daf_review`).
- **Geler les enveloppes budgétaires** (code NIP), suivre le % d'engagement, les feux budgétaires (2 % / 5 %), l'écart XOF/% et la date de premier franchissement après un BC hors enveloppe.
- Suivre les chantiers : total engagé, BC en cours, dépenses du mois ; actualiser après émission d'un BC par le SA.
- Consulter les livraisons (lecture) pour le contrôle.

**Ce qu'il ne peut pas faire :** chiffrer ou émettre un BC (SA), approuver le montant final (DAF), payer (CmPT).

---

## 7. DAF — Directeur administratif et financier (daf)

**Connexion :** `/manager/login` → espace **Achats chantier** (dossier à valider), **Livraisons** (lecture), **Suivi chantier** (enveloppe, indicateurs, photos).

**Ce qu'il voit :** les dossiers BC en attente de validation montant, les enveloppes, les indicateurs financiers, les livraisons (lecture seule).

**Actions possibles :**
- **Approuver le montant** des BC (seuil 500 000 FCFA sur montant final du BC ; en COMPTANT ≥ seuil, l'approbation vaut aussi validation du BT et appose la **signature DAF** sur la fiche de trésorerie).
- Valider le **dossier BT** (BC + BT + facture pro forma) pour les fournisseurs sans compte.
- Consulter les enveloppes, les écarts réalisé–budget, les photos de chantier.

**Ce qu'il ne peut pas faire :** émettre un BC (SA), geler une enveloppe (CdG), payer une facture (CmPT).

---

## 8. PDG (pdg)

**Connexion :** `/manager/login` → espace **Achats chantier** (dossiers ≥ seuil), **Suivi chantier** (enveloppe, indicateurs, photos).

**Ce qu'il voit :** les dossiers nécessitant son approbation finale, la synthèse des engagements, les indicateurs.

**Actions possibles :**
- **Approbation finale** des BC ≥ seuil (appose la **signature PDG** ; les signatures DAF + PDG coexistent sur la fiche de trésorerie).
- Consulter les enveloppes, les indicateurs consolidés, les photos de chantier.

**Ce qu'il ne peut pas faire :** tout le reste du circuit (émission, chiffrage, validations intermédiaires, livraison, facturation, paiement).

---

## 9. CmPT — Comptable (accountant)

**Connexion :** `/manager/login` → **espace Comptabilité uniquement** (ni Achats ni Livraisons : Tableau de bord, Suivi BC, Factures, Rapports).

**Ce qu'il voit :** le registre BC du mois (KPI : BC livrés / factures saisies), les factures transmises par le SA (statut Reçu), les rapports mensuels.

**Actions possibles :**
- Consulter le registre (lecture seule — **aucun champ de saisie SA** n'est modifiable côté comptable).
- Ouvrir l'**aperçu de la copie facture**, marquer une facture **Payée Oui/Non** (persistant).
- Naviguer entre les mois (Précédent / Suivant), filtrer le suivi par mode de paiement.
- **Exporter** : Suivi BC, Factures, Récap fournisseur, Suivi paiements (fichiers tableur du mois affiché, filtres appliqués).

**Ce qu'il ne peut pas faire :** saisir, joindre ou transmettre une facture (réservé au SA — refus 403), modifier le registre, accéder aux achats ou aux livraisons.

---

## 10. Contrôleur chantier (site_controller)

**Connexion :** `/manager/login` → espace **Achats chantier**, page **Livraisons**, catalogue en lecture.

**Ce qu'il voit :** les livraisons du mois et du jour (filtres OTP bloqué / Écarts / Livrées, filtre chantier), le détail des livraisons (déclaration + photos), les chantiers du catalogue.

**Actions possibles :**
- Suivre et contrôler les livraisons (constat d'écarts, refus, OTP bloqués) et remonter au DT / SA.
- Consulter les chantiers et leurs informations.

**Ce qu'il ne peut pas faire :** valider une EB, chiffrer, émettre un BC, approuver, facturer, payer, planifier une tournée.

---

## 11. Admin (gestionnaire administrateur)

**Connexion :** `/manager/login` → tous les onglets, dont **Équipe → Gestionnaires**.

**Actions possibles :**
- **Inviter** des gestionnaires par e-mail (lien unique, 72 h), lister / relancer / annuler les invitations.
- Modifier (nom, e-mail, rôle, mot de passe) et supprimer des comptes (impossible de supprimer le dernier admin).
- Gérer livreurs, catalogue, tournées, tâches (mêmes droits que manager + administration des comptes).
- Activer la **2FA admin** (`/manager/security`), consulter `ops-status`, piloter le seed/reset hors production.
- Créer son entreprise via `/manager/register` (si `ALLOW_SELF_SIGNUP` activé, sinon onboarding manuel).

---

## 12. Règles transverses (tous les rôles)

- **Session** : cookie de session ~8 h ; toute session sans `companyId` est rejetée (reconnectez-vous).
- **Mot de passe oublié** : `/manager/forgot-password` → e-mail → nouveau mot de passe.
- **Pièces jointes** : PDF/JPG/PNG, ~5 Mo max ; aperçu en plein écran ; suppression avec confirmation.
- **Livraisons partielles** : badge **« Écart »** (jamais « Livrée »), registre BC avec libellé « livraison partielle » et montant au prorata ; les refus affichent **« Refusée »**.
- **Preuves opposables** : chaque approbation enregistre décideur, date/heure, commentaire et vérification NIP ; les certificats de livraison restent consultables via leur lien.
- **Interdits** : ne jamais partager les liens certificat publics, ne jamais photographier un écran affichant OTP ou PIN, signaler tout compte ou livraison suspecte au support.

---

*Version 1.0 — pilote BTP société unique, septembre 2026. Vérifié contre le code (rôles `procurementRole`, matrice `SUIVI_CHANTIER_MATRIX`, garde-fous I81–I91).*


