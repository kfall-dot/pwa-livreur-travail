# TraceO® — Script présentation live (40–45 min)

**Public :** board + client pilote potentiel  
**Durée :** 40–45 min + 10 min Q&R  
**Règle d’or :** 70 % démo / histoire, 30 % slides  
**Slides :** voir [`PRESENTATION-SLIDES.md`](PRESENTATION-SLIDES.md)

---

## Checklist J-0 (15 min avant — obligatoire)

Cocher dans l’ordre. **Ne pas se fier à un test de la veille** : les identifiants prod peuvent changer (reset mot de passe, PIN livreur).

- [ ] **Manager** : connexion sur https://pwa-livreur.netlify.app/manager/login  
      → `kfallet@gmail.com` / `admin1234` (ou mot de passe défini après reset)  
      → onglet **Suivi** ouvert sur la date du jour
- [ ] **Livreur** : connexion sur https://pwa-livreur.netlify.app  
      → Aya `0700430402` / PIN `1234` (vérifier dans Manager → Livreurs si besoin)
- [ ] **Test sec API** : `DELIVERY_ID=del-k3 npm run presentation:dry-run` → viser **6/6 OK**
- [ ] **Textbee** : téléphone Android allumé, SIM CI, app connectée
- [ ] **Slides** : `docs/presentation-deck.html` ouvert (plein écran F11)
- [ ] **Arrêt démo** : `del-k3` (Yopougon) encore utilisable — sinon `del-k1` / nouvelle tournée

**Identifiants prod (juillet 2026)**

| Rôle | URL | Identifiant | Secret |
|------|-----|-------------|--------|
| Manager | `/manager/login` | `kfallet@gmail.com` | `admin1234` *(sauf si reset)* |
| Livreur démo OTP | `/` | `0700430402` | `1234` |
| Livreur alternatif | `/` | `0701234567` | `1234` |

> `manager@demo.fr` est l’e-mail **seed local / doc historique** — en prod pilote, utiliser **`kfallet@gmail.com`** (`SEED_MANAGER_EMAIL` sur Netlify).

**Si échec connexion manager** : https://pwa-livreur.netlify.app/manager/forgot-password  
**Si livreur verrouillé** : voir [`SUPPORT-PILOTE.md`](SUPPORT-PILOTE.md) (Netlify Blobs).

**Si « Identifiants invalides » alors que le mot de passe est correct** : la table `managers` en prod peut être vide (reset DB). Réaligner les données démo :

```bash
export NETLIFY_DB_URL="$(npx netlify env:get NETLIFY_DB_URL --context production)"
export SEED_MANAGER_EMAIL=kfallet@gmail.com MANAGER_PASSWORD=admin1234 DRIVER_PIN=1234
npx tsx --input-type=module -e "import { seedDemoData } from './server/db/seed.ts'; console.log(await seedDemoData())"
```

Puis retester la connexion manager.

**Arrêt démo recommandé :** `del-k3` — Entrepôt Yopougon · GPS `5.367`, `-4.0702` · 2 photos requises.

---

## Chronologie globale

| Plage | Acte | Support |
|-------|------|---------|
| 0:00–5:00 | Accroche litige | Slides 1–3 |
| 5:00–25:00 | Démo live | Smartphone + laptop |
| 25:00–40:00 | Vision + pilote | Slides 5–10 |
| 40:00–50:00 | Q&R | — |

---

## ACTE 1 — Accroche (5 min)

### Slide 1 — Titre (0:00–0:30)

**À l’écran :** *TraceO® — Quand le client dit « je n’ai pas reçu », qui a raison ?*

**À dire :**

> Bonjour. Aujourd’hui je ne vais pas vous parler d’un logiciel de livraison.  
> Je vais vous parler de ce qui se passe le vendredi à 17h, quand personne ne peut trancher.

---

### Slide 2 — La scène (0:30–2:30)

**À l’écran :** *Le chaos actuel — Excel → WhatsApp → « on m’a dit »*

**À dire (raconter, pas lire) :**

> Vendredi 17h. Le magasin de Treichville appelle : « Il manque 12 caisses. »  
> Le livreur dit : « J’ai tout déposé. »  
> Au bureau, on ouvre WhatsApp : une photo floue, un vocal de 47 secondes.  
> Personne n’a la même version des faits.  
> Le litige dure trois jours. Le client est mécontent. Le livreur est frustré.  
> Et le responsable logistique passe son week-end à relancer au lieu de piloter.

**Pause 2 secondes.**

> Ce n’est pas un problème de GPS. Le camion était peut-être bien là.  
> Ce qui manque, c’est une **preuve partagée** à l’arrêt : quoi, combien, validé par qui.

---

### Slide 3 — Le coût caché (2:30–5:00)

**À l’écran :** *TraceO en 10 secondes — planifié → livré → prouvé*

**À dire :**

> Le coût, ce n’est pas seulement la marchandise contestée. C’est :
> - le temps de dispatch et de relances ;
> - les litiges qu’on ne tranche jamais proprement ;
> - la confiance qui baisse chez le point de vente.
>
> TraceO® répond à une question simple : **comment prouver une livraison B2B**  
> sans ERP lourd, sans App Store pour le livreur, sans application pour le magasin ?
>
> La réponse tient en trois mots : **planifié, livré, prouvé**.  
> Je vous montre maintenant — en direct.

**Transition :** poser le téléphone en main, éteindre ou minimiser les slides.

---

## ACTE 2 — Démo live (20 min)

> **Ne pas commencer par le manager.** Le wow vient du téléphone.

### Étape 1 — Connexion livreur (5:00–7:00)

**Écran :** smartphone — https://pwa-livreur.netlify.app

**Actions :**
1. Saisir `0700430402`
2. PIN `1234`
3. Montrer la tournée du jour (3 arrêts Abidjan)
4. Ouvrir la **carte** (dépôt + arrêts)

**À dire :**

> Pas de compte Google, pas de téléchargement sur le Play Store.  
> Téléphone ivoirien, code PIN à quatre chiffres — comme un distributeur automatique.  
> Le livreur voit sa tournée du jour : séquence, adresses, produits, créneaux.

---

### Étape 2 — Démarrer l’arrêt (7:00–10:00)

**Écran :** arrêt **Entrepôt Yopougon** (`del-k3`, 3e arrêt)

**Actions :**
1. Ouvrir l’arrêt
2. **Démarrer** (GPS — géofence bypassée en pilote si besoin)
3. Montrer le parcours guidé (étapes en haut)

**À dire :**

> Chaque arrêt suit le même parcours imposé — pas de raccourci « j’ai livré » sans preuve.  
> On démarre l’arrêt quand on est sur zone.  
> Ensuite : photos, déclaration, validation du responsable du point.

---

### Étape 3 — Photos (10:00–13:00)

**Actions :**
1. Prendre **1 photo** (2 requises sur del-k3 — enchaîner si temps)
2. Montrer le compteur photos

**À dire :**

> Le nombre de photos est configurable par tournée.  
> Ce n’est pas une photo WhatsApp perdue dans un groupe : c’est attaché à la commande, à l’arrêt, à la date.

---

### Étape 4 — Déclaration (13:00–16:00)

**Actions :**
1. Choisir **Livraison complète**
2. Valider les quantités par produit (palettes mixtes, salade iceberg…)
3. **Mentionner** sans montrer : « On peut aussi déclarer partiel ou refusé — le bureau reçoit une tâche automatique. »

**À dire :**

> Ici le livreur déclare ce qui a été accepté, refusé, par produit et par unité — palette, caisse, etc.  
> Ce n’est pas un bouton « OK » : c’est structuré pour les litiges.  
> Si le magasin n’accepte que la moitié, on documente un **partiel** — et le bureau est notifié.

---

### Étape 5 — OTP SMS (16:00–19:00) — MOMENT WOW

**Actions :**
1. **Envoyer le code SMS** au responsable du point
2. Montrer le SMS reçu sur le téléphone (`+2250700430402` en démo)
3. Saisir le code à 6 chiffres
4. **Confirmer**

**À dire :**

> Le code part par SMS au responsable du magasin — pas besoin qu’il installe TraceO.  
> Il vérifie la marchandise, puis communique le code au livreur.  
> C’est la validation du **point de livraison**, pas seulement du chauffeur.

**Si SMS lent :** « Textbee transmet en quelques secondes — le responsable doit avoir son téléphone allumé. »

---

### Étape 6 — Certificat livreur (19:00–20:00)

**Actions :**
1. Montrer le **certificat** généré côté livreur
2. Noter l’identifiant / lien si affiché

**À dire :**

> La livraison est close. Le certificat existe — horodaté, lié à cette commande.

---

### Étape 7 — Manager Suivi (20:00–25:00)

**Écran :** laptop — https://pwa-livreur.netlify.app/manager/login (`kfallet@gmail.com` / `admin1234`)

**Actions :**
1. Onglet **Suivi** — date du jour
2. **Rafraîchir** — l’arrêt Yopougon passe en « livré »
3. Ouvrir le **détail** : quantités, photos, déclaration
4. Ouvrir le **certificat**

**À dire :**

> Pendant que le livreur était sur le terrain, le bureau peut suivre en temps réel.  
> Même données, même vérité : photos, quantités déclarées, validation OTP, certificat.  
> Si demain le client conteste, on ne cherche plus dans WhatsApp — on ouvre cette fiche.

**Bonus (2 min si temps) :** onglet **Tâches** → montrer une tâche « partielle » ou « manquée » seedée.

> « Le terrain dérape tous les jours — ce n’est pas un happy path artificiel. »

**Transition :** reprendre les slides.

---

## ACTE 3 — Vision et conversion (15 min)

### Slide 5 — Trois preuves, un certificat (25:00–28:00)

**À dire :**

> Ce que vous venez de voir, ce n’est pas du tracking GPS. C’est une preuve à trois niveaux :
> 1. **Photos** terrain  
> 2. **Déclaration** structurée par produit  
> 3. **Validation SMS** du responsable du point  
> → qui produit un **certificat** consultable.

---

### Slide 6 — Pensé pour la Côte d’Ivoire (28:00–31:00)

**À dire :**

> Numéros +225, SMS OTP, unités métier ivoiriennes — palette, caisse, plateau.  
> Multi-entreprise : chaque société a son espace isolé sur la même plateforme.  
> Et surtout : **opérationnel dès le jour 1** — pas un projet d’intégration de six mois.

---

### Slide 7 — Léger à déployer (31:00–33:00)

**À dire :**

> TraceO® n’est pas un ERP. Ce n’est pas un WMS.  
> On ne remplace pas votre système de gestion demain.  
> On **sécurise la preuve de livraison** dès aujourd’hui — entre Excel/WhatsApp et les suites lourdes.

---

### Slide 8 — Une journée type (33:00–35:00)

**À dire :**

> Le matin : le gestionnaire planifie la tournée — livreur, arrêts, produits, créneaux.  
> Sur la route : le livreur exécute le parcours qu’on vient de voir.  
> Le soir : le bureau consulte le suivi, traite les tâches, replanifie les reliquats sans tout ressaisir.

---

### Slide 9 — Pilote en 2 semaines (35:00–38:00)

**À l’écran :** tableau pilote (durée, périmètre, setup, succès)

**À dire :**

> On propose un pilote concret :
> - **2 semaines**
> - **1 à 2 livreurs**, **3 à 8 points réels** — vos produits, vos adresses
> - **1 heure** de mise en service accompagnée
> - On mesure : % de preuves complètes, temps de replan, litiges sans trace
>
> Checklist détaillée : [`CHECKLIST-JOUR-J-PILOTE.md`](CHECKLIST-JOUR-J-PILOTE.md)

---

### Slide 10 — On démarre quand ? (38:00–40:00)

**À dire :**

> Une seule question : **quand lance-t-on le pilote avec vos points Abidjan ?**  
> Une semaine, un livreur, vos vrais produits — et on revient avec les chiffres.
>
> Voici la fiche récap et l’URL : **pwa-livreur.netlify.app**

**Distribuer** la fiche A4 / PDF [`PRESENTATION-CLIENT.md`](PRESENTATION-CLIENT.md).

---

## Q&R — réponses courtes préparées

| Question | Réponse |
|----------|---------|
| « Et si pas de réseau ? » | Cache local pour consultation ; OTP et confirmation nécessitent le réseau. |
| « Le magasin doit installer quelque chose ? » | Non — SMS seulement. |
| « Compatible ERP ? » | Export / certificat consultable ; pas de connecteur ERP natif en phase 1. |
| « Combien de livreurs max ? » | Plateforme multi-tenant — scaling par entreprise. |
| « Sécurité des données ? » | Espace isolé par compagnie, HTTPS, pas de partage entre clients. |

---

## Variante 25 min (urgence)

| Min | Contenu |
|-----|---------|
| 0–3 | Slides 1–2 (accroche litige) |
| 3–18 | Démo complète (étapes 1–7, version courte) |
| 18–25 | Slides 9–10 (pilote + CTA) |

---

## Phrases à placer (mémo)

1. « On ne remplace pas votre ERP demain — on sécurise la preuve dès aujourd’hui. »
2. « Le responsable du magasin valide par SMS, sans installer TraceO. »
3. « Partiel, refus, replan : ce n’est plus du chaos WhatsApp, c’est un parcours. »

---

## À éviter absolument

- Liste de fonctionnalités avant la démo
- Jargon technique (Netlify, Sentry, PWA, Drizzle…)
- Démo Kouassi / Paris devant un public ivoirien
- Finir sans date de pilote ni décision demandée

---

*Script aligné sur la plateforme TraceO® — juillet 2026.*
