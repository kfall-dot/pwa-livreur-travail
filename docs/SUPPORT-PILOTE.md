# Support éditeur — Pilote TraceO®

Modèle opérationnel pour accompagner un client / board pendant un pilote sur https://pwa-livreur.netlify.app.

**Documents liés :** [`CHECKLIST-JOUR-J-PILOTE.md`](CHECKLIST-JOUR-J-PILOTE.md) · [`CONFIGURATION-PILOTE.md`](CONFIGURATION-PILOTE.md) · [`SECURITY-OPS.md`](SECURITY-OPS.md)

**Dernière mise à jour :** juillet 2026

---

## 1. Principe : deux niveaux de support

| Niveau | Qui | Responsabilité |
|--------|-----|----------------|
| **N1 — Métier (client)** | Responsable logistique / manager TraceO | Planifier, créer livreurs et points, expliquer l’OTP aux magasins, premier dépannage terrain |
| **N2 — Éditeur (vous)** | Porteur produit / technique TraceO | Infra, SMS, bugs, comptes, incidents production |

Le client **exploite** l’outil au quotidien. Vous **garantissez que la plateforme fonctionne** et débloquez les cas techniques.

---

## 2. Périmètre du support pilote

### Inclus (N2 — éditeur)

- Disponibilité et santé de la plateforme (site, API, base, Blobs)
- Configuration et dépannage **SMS OTP** (Textbee / Twilio)
- Configuration et dépannage **e-mail** manager (Brevo SMTP)
- Onboarding initial (register, première tournée test, test OTP)
- Bugs applicatifs confirmés (avec Sentry / logs)
- Conseil sur l’usage du dashboard (où corriger un numéro, un point, un livreur)
- Correctifs **P0 / P1** en production si nécessaire

### Hors périmètre (reste côté client)

- Planification quotidienne des tournées
- Dispatch et relances livreurs au fil de la journée
- Formation des responsables magasin au process métier (vérifier avant OTP)
- Problèmes réseau / GPS / téléphone du livreur ou du magasin
- Saisie ou modification des données métier **à la place** du client (sauf urgence documentée avec accord)
- Évolutions produit (roadmap → [`../ameliorations-futures.md`](../ameliorations-futures.md))
- Hotline 24/7 (sauf accord commercial distinct)

---

## 3. Coordonnées support (à personnaliser)

| Canal | Valeur | Usage |
|-------|--------|--------|
| E-mail | *À renseigner* | Tickets, captures d’écran, suivi formel |
| WhatsApp / téléphone | *À renseigner* | Urgences terrain J1, P0/P1 |
| Horaires | *Ex. lun–ven 8h–18h (Abidjan)* | Heures ouvrées pilote |
| Urgence P0 | *Même numéro ou dédié* | Site down, SMS totalement HS |

**Règle :** un canal principal + horaires affichés au client **avant** le jour J.

---

## 4. Avant le pilote — support « onboarding »

**Durée :** 30 à 60 minutes (visio ou sur place).

**Agenda type :**

1. Création espace : https://pwa-livreur.netlify.app/manager/register (ou accompagnement si `ALLOW_SELF_SIGNUP=false`)
2. Catalogue produits + points (téléphone responsable OTP en **+225**)
3. Création d’au moins un livreur (PIN communiqué en main propre)
4. Planification d’une tournée test
5. Test OTP réel vers un numéro contrôlé
6. Installation PWA livreur (« Ajouter à l’écran d’accueil »)
7. Remise de la [`CHECKLIST-JOUR-J-PILOTE.md`](CHECKLIST-JOUR-J-PILOTE.md)

**Livrables côté éditeur (J-1) :**

- [ ] SMS et e-mail réels vérifiés sur Netlify prod
- [ ] Sentry actif (`SENTRY_DSN`, `VITE_SENTRY_DSN`)
- [ ] Pas de `OTP_CODE` / bypass prod non documentés
- [ ] Coordonnées support communiquées au responsable client

---

## 5. Pendant le pilote — organisation

### Calendrier type (2 semaines)

| Phase | Activité éditeur |
|-------|------------------|
| **J-1** | Vérif infra + onboarding manager |
| **J1** | Disponibilité renforcée (« war room ») pendant la 1ère tournée réelle |
| **J2–J5** | Support réactif sur canal unique ; le client est autonome sur le métier |
| **J6** | Point mi-pilote 30 min (blocages, indicateurs) |
| **J7–J10** | Support réactif, volume en baisse |
| **Fin pilote** | Restitution board + décision extension |

**Volume attendu :** 2–5 sollicitations / semaine après J2 si l’onboarding est correct.

### Ce que le client fait sans vous

- Planifier les tournées
- Créer / suspendre des livreurs
- Mettre à jour les téléphones OTP des points
- Traiter les tâches manager (partiel, replan)
- Relancer un magasin qui ne communique pas le code
- **Assistance OTP** depuis la fiche livraison (dashboard manager) : renvoi SMS + code affiché pour relai vocal, ou validation manuelle tracée si SMS impossible

### Assistance OTP manager (terrain)

Dans **Livraisons → détail d’une livraison**, section **Assistance OTP** :

| Action | Quand l’utiliser |
|--------|------------------|
| **Renvoyer SMS / afficher code** | SMS non reçu, Textbee lent — le code s’affiche pour être dicté au responsable magasin par téléphone |
| **Valider la livraison sans OTP** | SMS indisponible (Panne Textbee, numéro erroné corrigé trop tard) **après** accord téléphonique avec le magasin ; motif obligatoire (15 car. min.), action auditée |

**Prérequis** (côté livreur) : livraison démarrée, déclaration produit saisie, photos complètes. Sinon le panneau indique ce qui manque.

Le livreur n’a **pas** à attendre une intervention éditeur (P1) si le manager peut débloquer sur place.

### Ce qui déclenche un appel N2

| Symptôme | Action éditeur typique |
|----------|------------------------|
| Pas de SMS OTP | Textbee (app Android), numéro point catalogue, logs Netlify `[OTP]` ; **d’abord** assistance OTP manager (renvoi / relai vocal / validation manuelle) |
| Livreur bloqué au démarrage | GPS / géofence — guider terrain ; bypass prod **dernier recours** documenté |
| Photos invisibles manager | Blobs, Functions, redeploy si besoin |
| Connexion manager impossible | Cookie, mot de passe, `ALLOW_SELF_SIGNUP`, invitation |
| Erreur écran / bug | Reproduire, Sentry, correctif si confirmé |
| Certificat / e-mail absent | Brevo, `EMAIL_FROM`, logs SMTP |

---

## 6. Grille de priorité et délais (pilote)

| Priorité | Définition | Exemples | Délai cible (heures ouvrées) |
|----------|------------|----------|------------------------------|
| **P0** | Plateforme inutilisable | Site down, aucun SMS, base inaccessible | < 2 h |
| **P1** | Parcours bloqué | OTP systématiquement en échec, livreur bloqué toute la flotte | < 4 h ou fin de journée |
| **P2** | Gênant mais contournable | UX, question formation, un arrêt isolé | J+1 |
| **P3** | Évolution | Nouvelle fonctionnalité, amélioration confort | Roadmap post-pilote |

**Engagement pilote :** pas de déploiement fonctionnel majeur sauf correctif P0/P1 validé — stabilité prod prioritaire.

---

## 7. Informations à demander à chaque ticket

Pour traiter rapidement, demander systématiquement :

1. **Entreprise** (nom) + **livraison** (ID ou magasin) si applicable
2. **Rôle** : livreur / manager / magasin
3. **Étape du parcours** : démarrage, photo, déclaration, OTP, confirmation
4. **Message d’erreur** exact (capture d’écran)
5. **Date/heure** + **réseau** (4G / WiFi)

Sans ces éléments, prévoir un aller-retour avant diagnostic.

---

## 8. Boîte à outils éditeur (technique)

| Outil | Usage |
|-------|--------|
| **Netlify** (logs Functions, env, deploy) | Erreurs API, redeploy, variables |
| **Sentry** | Erreurs PWA + serveur |
| **Textbee** | État appareil SMS OTP |
| **Brevo** | Envoi e-mails, bounces |
| `GET /api/v1/health` | Config / sécurité prod |
| `GET /api/v1/admin/ops-status` | Flags `ALLOW_*`, compteurs (compte manager de test) |

Voir [`SECURITY-OPS.md`](SECURITY-OPS.md) pour l’audit env et la surveillance.

**Données client :** pas d’accès au compte manager production sans **accord explicite** (invitation temporaire, compte support dédié, ou export fourni par le client).

### Déverrouillage login livreur (avant délai 30 min)

**Depuis le dashboard manager** : Livreurs → Modifier → **Réinitialiser verrouillage login** (action auditée).

Le verrouillage est stocké dans Netlify Blobs (`rate-limits`), pas en base. En secours technique (sans accès manager) :

```bash
# Ex. livreur +2250700430402
npx netlify blobs:delete rate-limits "driver-pin-fail:+2250700430402"
npx netlify blobs:delete rate-limits "login-driver:+2250700430402"
```

---

## 9. Limites et engagements à communiquer au board

- Support pilote = **plateforme + SMS/e-mail + onboarding**, pas remplacement du responsable logistique
- Pas de modification des données métier (tournées, quantités) sans validation du client
- Pas de promesse hors-ligne complet (confirmation sans réseau) — voir item 7 [`ameliorations-futures.md`](../ameliorations-futures.md)
- Évolutions produit consolidées **après** le pilote
- Confidentialité : ne pas partager OTP, PIN ou liens certificat dans les canaux support non sécurisés

---

## 10. Synthèse

> **Rôle éditeur :** assurer que TraceO® fonctionne en production et que le premier parcours OTP réussit ; ensuite débloquer les incidents techniques pendant que le client exploite l’outil au quotidien.

| Phase | Vous | Client |
|-------|------|--------|
| Avant | Infra OK, onboarding, checklist | Valider périmètre, numéros, briefings |
| J1 | War room technique | Exécution terrain |
| Semaine 1–2 | Support P0–P2 | Exploitation + tâches manager |
| Fin | Restitution technique + indicateurs | Décision board (étendre / ajuster / stop) |

---

*Document opérationnel — TraceO® / PWA Livreur*
