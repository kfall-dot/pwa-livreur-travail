# Checklist Jour J — Pilote TraceO® (board)

**Site production :** https://pwa-livreur.netlify.app  
**Durée pilote recommandée :** 1 à 2 semaines · 1 entreprise · 1–2 livreurs · 3–8 points réels  
**Dernière mise à jour :** juillet 2026

---

## Avant le pilote (J-7 à J-1)

### Technique (équipe produit / IT)

- [ ] Le site répond : https://pwa-livreur.netlify.app
- [ ] Base Postgres OK (`NETLIFY_DB_URL`, migrations à jour)
- [ ] `JWT_SECRET` fort configuré (prod)
- [ ] `PUBLIC_BASE_URL` = URL prod (liens e-mails)
- [ ] **SMS OTP** : `SMS_PROVIDER=textbee` (ou Twilio) + appareil Android allumé avec SIM CI
- [ ] **E-mail manager** : Brevo SMTP (`EMAIL_PROVIDER=smtp`, `EMAIL_FROM` vérifié)
- [ ] Pas de `OTP_CODE` fixe en production
- [ ] Décision prise : `ALLOW_SELF_SIGNUP=true` (client autonome) ou onboarding manuel
- [ ] Pas de `ALLOW_RESET` / `ALLOW_SEED` activés sur l’environnement client
- [ ] Sentry / logs Netlify accessibles pour le support (voir [`SUPPORT-PILOTE.md`](SUPPORT-PILOTE.md))

### Métier (client / board)

- [ ] Périmètre validé : quels livreurs, quels points, quelle durée
- [ ] Responsable logistique identifié (compte manager admin)
- [ ] Numéros **+225** des responsables magasin confirmés (OTP SMS)
- [ ] Livreurs briefés : téléphone + PIN, GPS activé, data mobile
- [ ] Responsables magasin briefés : « vérifier la marchandise avant de donner le code SMS »

---

## Jour 0 — Mise en service (30 à 60 min)

### Création de l’espace

- [ ] Ouvrir https://pwa-livreur.netlify.app/manager/register  
      *(ou session accompagnée si inscription désactivée)*
- [ ] Connexion manager : https://pwa-livreur.netlify.app/manager/login

### Données de référence

- [ ] **Produits** : au moins 2–3 articles du catalogue réel (unités correctes)
- [ ] **Points de livraison** : nom, adresse, **téléphone responsable OTP**, coordonnées si possible
- [ ] **Livreurs** : nom, téléphone +225, PIN 4 chiffres communiqué au livreur

### Tournée test

- [ ] Planifier **1 tournée** : date du lendemain (ou jour J), 1 livreur, 1–3 arrêts
- [ ] Vérifier : produits par arrêt, nombre de photos requis, créneaux / instructions

### Test sec (bureau, 15 min)

- [ ] Connexion livreur sur smartphone : https://pwa-livreur.netlify.app
- [ ] PWA installée (« Ajouter à l’écran d’accueil »)
- [ ] Envoi OTP test vers **votre** numéro (point catalogue avec votre mobile)
- [ ] Réception SMS + saisie code + certificat généré
- [ ] Manager : suivi statut, détail livraison, photos, lien certificat

---

## Jour 1 — Première tournée réelle

### Matin

- [ ] Livreur connecté, tournée du jour visible
- [ ] Support joignable (téléphone / WhatsApp interne)

### Par arrêt (checklist livreur)

- [ ] **Démarrer** (proximité GPS ~200 m du point)
- [ ] **Photos** (nombre requis atteint)
- [ ] **Déclaration** : complet / partiel / refusé + quantités par produit
- [ ] **OTP** : SMS envoyé au responsable du point
- [ ] Responsable magasin a **vérifié** avant de communiquer le code
- [ ] **Confirmation** → certificat disponible

### Soir (debrief 15 min)

- [ ] Combien d’arrêts clôturés avec preuve complète ?
- [ ] Blocages rencontrés ? (GPS, SMS, réseau, géofence)
- [ ] Actions correctives pour J+1 notées

---

## Semaine 1–2 — Exploitation pilote

- [ ] 1–2 livreurs en rotation quotidienne
- [ ] Manager consulte **Suivi livraisons** + **Tâches** chaque jour
- [ ] Replanifications testées si livraison partielle / échec
- [ ] Pas de changement technique non validé en prod pendant le pilote
- [ ] Incidents consignés (date, livraison, symptôme, résolution)

### Indicateurs à noter (fin de pilote)

| Indicateur | Début pilote | Fin pilote |
|------------|--------------|------------|
| Arrêts avec photos + OTP + certificat | | |
| Livraisons partielles / refusées (tâches créées) | | |
| Temps moyen pour replanifier un reliquat | | |
| Litiges « sans trace » | | |
| Adoption livreurs (connexion quotidienne) | | |

---

## Dépannage rapide

| Symptôme | Vérifier en premier |
|----------|---------------------|
| Livreur verrouillé (5 mauvais PIN, ~30 min) | `netlify blobs:delete` sur `driver-pin-fail:+225…` (voir [`SUPPORT-PILOTE.md`](SUPPORT-PILOTE.md)) ; bouton manager prévu (item 10 roadmap) |
| SMS OTP non reçu | Numéro point catalogue (+225), Textbee en ligne, crédit SIM |
| Bloqué au démarrage | GPS activé, proximité point (~200 m), précision GPS |
| Photos invisibles manager | Prod Netlify + Blobs ; recharger modale détail |
| E-mail manager absent | Brevo, `EMAIL_FROM`, logs Functions Netlify |
| OTP expiré | Renvoyer le code (TTL 10 min) |

Guide complet : [`CONFIGURATION-PILOTE.md`](CONFIGURATION-PILOTE.md)

---

## Fin de pilote — Revue board

- [ ] Présentation des indicateurs (tableau ci-dessus)
- [ ] Retours livreurs, managers, responsables magasin
- [ ] Décision : **étendre** / **ajuster** (process ou produit) / **arrêter**
- [ ] Si extension : calendrier flotte complète + formation managers

---

## À ne pas faire pendant le pilote

- Modifier le flux livraison / géofence / OTP en prod sans validation
- Activer seed ou reset sur l’environnement client
- Promettre le hors-ligne complet (confirmation sans réseau) — non livré à ce stade
- Utiliser le compte démo seed pour les livraisons client réelles (espace dédié obligatoire)

---

## Liens utiles

| Rôle | URL |
|------|-----|
| App livreur | https://pwa-livreur.netlify.app |
| Inscription entreprise | https://pwa-livreur.netlify.app/manager/register |
| Connexion manager | https://pwa-livreur.netlify.app/manager/login |
| Fiche présentation | [`PRESENTATION-CLIENT.md`](PRESENTATION-CLIENT.md) |
| Support éditeur (pilote) | [`SUPPORT-PILOTE.md`](SUPPORT-PILOTE.md) |
| Fonctionnalités | [`FONCTIONNALITES.md`](FONCTIONNALITES.md) |

*Document opérationnel — TraceO® / PWA Livreur*
