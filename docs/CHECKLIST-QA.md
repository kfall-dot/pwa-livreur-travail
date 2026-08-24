# TraceO® — Checklist QA manuelle

Inventaire des fonctionnalités à tester **par persona** et **par interface**.  
Complète les invariants automatisés (`e2e/INVARIANTS.md`) ; ne remplace pas `npm run regression`.

**Comptes utiles (démo / E2E)**

| Rôle | Identifiant | Secret |
|------|-------------|--------|
| Livreur | `+2250701234567` | PIN `1234` |
| Manager | `manager@demo.fr` (ou e-mail pilote local) | `admin1234` |
| OTP (dev) | — | `123456` |

**Légende** : `[ ]` à faire · `[x]` OK · `[~]` partiel / bug connu

---

## 0. Cartographie routes

| Persona | Routes |
|---------|--------|
| Public / auth | `/login`, `/manager/login`, `/manager/register`, `/manager/invite`, `/manager/forgot-password`, `/manager/reset-password`, 404 |
| Livreur | `/` (Tournée), `/map`, `/profile`, `/delivery/:id` |
| Gestionnaire | `/manager` (onglets), `/manager/security` |
| Admin entreprise | Même `/manager` + onglet **Gestionnaires** |

---

## 1. Public / auth

### 1.1 Connexion livreur — `/login`

- [ ] Formulaire : téléphone (+225), PIN, **Se connecter**
- [ ] Saisie 10 chiffres nationaux sans débordement du champ
- [ ] Option **Se souvenir de moi**
- [ ] Afficher / masquer le PIN
- [ ] PIN invalide → message d’erreur
- [ ] PIN valide → tableau de bord
- [ ] Après 5 mauvais PIN → message de verrouillage / tentatives

### 1.2 Connexion gestionnaire — `/manager/login`

- [ ] Champs e-mail, mot de passe, bouton de connexion
- [ ] Lien **Mot de passe oublié ?**
- [ ] Lien **Créer mon espace** → `/manager/register`
- [ ] Si 2FA activée : écran code 2FA + validation / retour

### 1.3 Inscription entreprise — `/manager/register`

- [ ] Formulaire visible (pas de redirection silencieuse vers l’app livreur)
- [ ] Champs : nom entreprise, nom, e-mail manager, mot de passe (≥ 8)
- [ ] Soumettre → création d’un espace isolé
- [ ] Lien **Connexion**

### 1.4 Invitation gestionnaire — `/manager/invite`

- [ ] Activer le compte avec jeton : mot de passe, confirmer, **Activer**
- [ ] Lien **Déjà un compte ? Se connecter**

### 1.5 Mot de passe oublié / reset

- [ ] `/manager/forgot-password` : e-mail → message « lien de réinitialisation »
- [ ] `/manager/reset-password` : nouveau MDP + confirmation → **Mot de passe mis à jour**
- [ ] Reconnexion avec le nouveau mot de passe

### 1.6 Page 404

- [ ] Titre **Page introuvable**
- [ ] Liens : créer mon entreprise, connexion manager, connexion livreur

---

## 2. Livreur (PWA)

Navigation : **Tournée** · **Carte** · **Profil**  
Bannière si hors ligne : mode hors ligne / sync à la reconnexion.

### 2.1 Tableau de bord — `/` (Tournée)

- [ ] Héros (nom, statut En ligne / Hors ligne)
- [ ] Calendrier : mois précédent / suivant ; jours avec livraisons
- [ ] Bouton **Aujourd’hui** (si date ≠ aujourd’hui)
- [ ] Bouton **Actualiser**
- [ ] Récap progression (X / Y livrés)
- [ ] Bannière **Prochaine livraison** + CTA
- [ ] Filtres : **Toutes** · **À faire** · **Terminées**
- [ ] Cartes arrêt : séquence, statut, adresse, contenu, créneau
- [ ] Unité planifiée respectée (ex. **caisses**, pas « palette » par défaut)
- [ ] Contenu multi-produits → libellé **multiple**
- [ ] Pas de champ **Poids** (contenu = quantités / unités uniquement)
- [ ] Plusieurs tournées le même jour → tous les arrêts (+ indication multi-tournées)
- [ ] Liste visible dès la réponse API (pas bloquée par la carte)
- [ ] Clic carte → `/delivery/:id` (si accessible)
- [ ] Arrêt futur / verrouillé : consultation seule ou message d’accès
- [ ] Date passée non terminée → **Date passée** (pas « À venir »)
- [ ] Livraison partielle → badge **Partielle** (pas **Livrée**)

### 2.2 Carte — `/map`

- [ ] Dépôt, arrêts, itinéraire
- [ ] Position GPS si autorisée
- [ ] État vide : aucune livraison sur la carte
- [ ] Clic arrêt → fiche / livraison
### 2.3 Parcours livraison — `/delivery/:id`

Étapes : **Démarrer → Photos → Déclaration → OTP → Confirmation**

#### Démarrer

- [ ] Infos arrêt (contenu, réf., créneau — pas de poids)
- [ ] OTP : message indique le tél. **responsable du point** (pas le login livreur)
- [ ] Bouton **Démarrer la livraison**
- [ ] Hors zone → erreur géofence (distance affichée) — si géofence active

#### Photos

- [ ] Prendre une photo / choisir fichier
- [ ] Compteur / cible requise
- [ ] **Continuer vers la déclaration**
- [ ] **Annuler la livraison** → confirmer → retour **À démarrer**

#### Déclaration

- [ ] Radios : acceptée / partielle / refusée
- [ ] Partiel : accepté / refusé + motif par produit
- [ ] Refus : motif obligatoire
- [ ] **Enregistrer la déclaration**

#### OTP

- [ ] **Envoyer le code** (tél. responsable du point / catalogue)
- [ ] Saisie code à 6 chiffres
- [ ] **Renvoyer** sans devoir re-déclarer
- [ ] Continuer vers confirmation

#### Confirmation

- [ ] Écran **Confirmation** → valider
- [ ] Certificat / reçu `RCT-…` visible
- [ ] Retour dashboard : compteur livrés à jour

#### Consultation arrêt terminé

- [ ] Quantités attendues **et** livrées
- [ ] Statuts adaptés (livré / partiel / refusé)
- [ ] **Retour au tableau de bord**

### 2.4 Profil — `/profile`

- [ ] Nom, téléphone
- [ ] Stats jour : livrées / restantes / refus
- [ ] Synchro (En ligne / Hors ligne), libellé TraceO®
- [ ] Livraisons du jour avec statuts
- [ ] Bouton certificat (ouvre le reçu)
- [ ] **Déconnexion** → `/login`

### 2.5 Offline / PWA

- [ ] Installer (« Ajouter à l’écran d’accueil »)
- [ ] Couper le réseau → bannière hors ligne
- [ ] Navigation shell en cache
- [ ] Reconnexion → reprise de sync

---

## 3. Gestionnaire — `/manager`

Header : nom · **Sécurité 2FA** · **Déconnexion**  
Sidebar : **Suivi** · **Planifier** · **Catalogue** · **Équipe** · **Tâches**

### 3.1 Suivi livraisons

- [ ] Filtre date
- [ ] Filtres statut : Tous / À démarrer / En cours / OTP envoyé / Livrée / Échouée
- [ ] KPI : livraisons / validées / en attente
- [ ] Bannière tâches → **Voir les tâches**
- [ ] Groupes par tournée (replier / déplier)
- [ ] Par tournée : **Replanifier** · **Modifier** · **Supprimer** (si aucun arrêt livré)
- [ ] Ligne arrêt → **Voir détail**

#### Modale détail

- [ ] Identité, statut, livreur, dépôt, fenêtre
- [ ] Quantités attendues / livrées
- [ ] Table déclaration (accepté / refusé / motif)
- [ ] Photos livreur
- [ ] **Certificat** → page HTML « Bon de livraison » (pas page login)
- [ ] Modifier la tournée / Fermer

#### Assistance OTP

- [ ] Panneau assistance (livraison en cours / OTP)
- [ ] Renvoyer SMS / afficher code (relai vocal)
- [ ] Valider sans OTP → livraison validée + `RCT-…`

### 3.2 Planifier une tournée

- [ ] Date à planifier ; liste des tournées du jour
- [ ] Actions : Modifier · Replanifier
- [ ] Création : livreur, créneau, dépôt (nom + adresse)
- [ ] Arrêts : point catalogue **actif**, produits (qté + unité), réf. auto `CMD-…`
- [ ] **+ Ajouter un arrêt**
- [ ] **Créer la tournée et notifier le livreur** → SMS + redirection Suivi
- [ ] Édition : dépôt / arrêts non livrés → visible Suivi + Planifier
- [ ] Replan : bannière + **Annuler** → retour onglet / date source
- [ ] Créer tournée replanifiée / pour le reliquat
- [ ] Point inactif non proposé pour nouvelles tournées

### 3.3 Catalogue — Points de livraison

- [ ] Ajouter : nom, adresse, tél. responsable (OTP), contact, e-mail
- [ ] Modifier
- [ ] Toggle actif / inactif (persiste après rechargement)
- [ ] Point inactif exclu des nouvelles tournées

### 3.4 Catalogue — Produits

- [ ] Nouveau produit : libellé, unité, ordre
- [ ] Liste + toggle actif + édition

### 3.5 Catalogue — Unités de mesure

- [ ] Créer unité (libellé, code, ordre)
- [ ] Toggle actif + édition

### 3.6 Équipe — Livreurs

- [ ] Ajouter : nom, téléphone +225, PIN
- [ ] Téléphone déjà pris → erreur claire (pas « Erreur serveur »)
- [ ] Liste : actif / suspendu
- [ ] Modifier : nom, téléphone, PIN
- [ ] **Réinitialiser le verrouillage login**
- [ ] Désactivation → tâches de réaffectation si tournées futures

### 3.7 Équipe — Gestionnaires *(admin uniquement)*

- [ ] Invitation : nom, e-mail, **Envoyer l’invitation**
- [ ] Liste des gestionnaires
- [ ] Manager non-admin : onglet **Gestionnaires** absent

### 3.8 Tâches

- [ ] Liste (confirmée, partielle, manquée, annulée, réaffectation…)
- [ ] Actions : Voir · Ouvrir la tournée · Replanifier (si éligible) · Marquer traitée
- [ ] Partielle sans reliquat → pas de bouton **Replanifier**

### 3.9 Sécurité 2FA — `/manager/security`

- [ ] Statut Activée / Désactivée
- [ ] Setup → secret / URI → code 6 chiffres → activer
- [ ] Login suivant demande le code 2FA

### 3.10 Multi-entreprises

- [ ] Deux espaces : données isolées (listes, photos, ressources)
- [ ] Accès croisé → refus (403/404), jamais de fuite 200

---

## 4. Smoke journée type (bout-en-bout)

- [ ] 1. Manager : planifier 2–4 arrêts (caisses + multi-produits)
- [ ] 2. Livreur : login → liste + carte
- [ ] 3. Arrêt 1 : démarrer → photos → acceptée → OTP → certificat
- [ ] 4. Arrêt 2 : partielle → badge Partielle ; manager voit détail + photos
- [ ] 5. Manager : assistance OTP ou validation manuelle
- [ ] 6. Manager : replan / modifier dépôt → vérifier Suivi
- [ ] 7. Profil livreur : certificat + déconnexion
- [ ] 8. (Option) Couper le réseau pendant navigation PWA

---

## 5. Invariants E2E liés (référence)

Voir le détail dans [`e2e/INVARIANTS.md`](../e2e/INVARIANTS.md).

| ID | Règle |
|----|--------|
| I01 | Login livreur → dashboard |
| I02 | Caisse planifiée = caisses chez le livreur |
| I03 | Parcours complet start → confirmation |
| I04 | Annuler depuis photos → à démarrer |
| I05 | Annuler replan → bon onglet |
| I06–I07 | Édition tournée → Suivi à jour |
| I09 | Quantités livrées visibles livreur + manager |
| I14 | OTP téléphone catalogue si besoin |
| I16 | Renvoyer OTP sans re-déclarer |
| I17 | Partiel → badge Partielle |
| I18 | Création tournée → SMS + Suivi + orderRef |
| I19 | Certificat = HTML, pas login |
| I20 | Multi-tournées même jour |
| I22 | Suppression tournée sans livré |
| I23–I28 | Isolation multi-entreprises |
| I26 | Téléphone login 10 chiffres |
| I27 | Point désactivé persiste |
| I29 | Date passée ≠ « À venir » |

**Hors E2E (manuel prioritaire si critique)** : géocodage, KPI fraude, édition d’arrêts déjà livrés, parité complète cache IndexedDB après édition manager.

---

## 6. Journal de session (optionnel)

| Date | Testeur | Environnement (prod / preview / local) | Résultat | Notes |
|------|---------|----------------------------------------|----------|-------|
| | | | | |
