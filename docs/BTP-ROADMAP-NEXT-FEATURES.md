# 📈 BTP — Roadmap : Prochaines Fonctionnalités à Fort Impact

> **Contexte** : L'application fonctionne aujourd'hui (Railway prod + Netlify, base Neon + Drizzle ORM, chauffeurs + photos géolocalisées, EB→BC→livraisons, budgets/avenants, rapports CDS).  
Ce fichier consigne les **recommandations prioritaires** pour passer du **suivi opérationnel** à la **pilotage décisionnel + traçabilité contractuelle**.

---

## 🎯 Recommandation prioritaire (1) : Dashboard Direction consolidé + alerte proactive

### 💼 Problème métier
Chaque indicateur existe mais est cantonné dans un onglet dédié (Suivi chantier, Achats, Livraisons, Ma journée). Le PDG / DAF / DT doivent **ouvrir 4 pages** pour répondre à :

> *« Qu'est-ce qui va mal cette semaine, sur l'ensemble des chantiers ? »*

### 💡 Solution proposée
Une **page unique « Direction »** consolidant en temps réel :
| Brique | Contenu |
|---|---|
| Feuille de route des chantiers | Enveloppe gelée ?, % engagé, feux 🟢🟡🔴, avenant manquant, stock négatif |
| Alertes 18h consolidées | Tous les chantiers sans dossier du jour soumis |
| Sous-alerte « livraison en retard » | Tournées planifiées dont la date est passée et non confirmées |
| Top fournisseurs | Volume + montant par fournisseur sur le mois |
| Ventilation par catégorie de dépense | Ciment / Ferraillage / Peinture... vue d'ensemble (pas chantier par chantier) |

Les alertes deviennent **proactives** : calculées côté serveur, exposées via `GET /api/v1/direction/dashboard`, affichées dans l'interface, puis **branchables sur WhatsApp/SMS push** (Twilio déjà configuré pour OTP) sans réécriture de l'analyse.

### 🔗 Briques existantes réutilisables
- `GET /procurement/sites/budgets` (Suivi chantier) — enrichir avec `daily=false` + agrégation par catégorie
- `GET /daily-reports/site-summary?month=` — indicateurs jour/nuit, top 3, daily
- `GET /tours/today` — filtre à appliquer pour les retards
- `GET /procurement/suppliers` + `listPurchaseRequestLines` — top fournisseurs
- `ebSpendCategory` (ventilation déjà stockée en DB) pour la consolidation

### 🛠️ Structure proposée
- **`/manager/direction`** : nouvelle route React + `DirectionDashboard`
- **Middleware `COMPANY_WIDE_ACCESS_ROLES`** = `[technical_director, purchasing, daf, pdg, controle_gestion]` (déjà existant) → accès garanti
- Chaque bloc est **affichable/masquable** par rôle (même pattern `canSeeSuiviBlock`)
- `GET /api/v1/direction/dashboard` → charge toutes les données une fois → cache Redis 5 min

### ⏱️ Effort estimé
- **Frontend** : 3 jours (Dashboard + 5 blocs + responsive)
- **Backend** : 2 jours (endpoint consolidation + cache)
- Total : ~5 jours/homme

---

## 🔀 Alternatives fortement recommandées (2)

### 📄 PV de réception PDF + QR de vérification
- **À la confirmation d'une livraison** (photos déjà prises + OTP validé) : génération d’un **procès-verbal PDF signé** avec **QR code anti-fraude** (contenu = hash SHA256 de toutes les photos + OTP)
- Le SA peut partager ce PDF dans le fil WhatsApp du chantier → traçabilité contractuelle complète
- **Réutilise** : `sharp` (déjà dans `lib/`) pour la génération d’image, `react-pdf` pour le PDF
- Effort : **2 jours** (génération PDF + signature QR)

### 🔔 Notifications push + SMS proactives
- **Branches les alertes existantes** (18h, stock négatif, budget > 95%, livraison en retard) sur un canal réel (WhatsApp via Twilio, déjà configuré pour OTP)
- **Plus besoin d'ouvrir l'app** → le chauffeur/CDC/DT reçoit un message d'alerte
- **Réutilise** : `lib/smsService.ts`, `TwilioVerifyService`
- Effort : **3 jours** (service notification + UI de gestion des alertes)

### 💰 Cash-flow fournisseurs
- Colonne « facturé vs payé » sur les BC (échéances + relances)
- Vue pour le DAF : écarts, délais de paiement moyens, fournisseurs en retard
- Effort : **3 jours** (nouvelle table + endpoint + onglet DAF)

---

## 📊 Priorisation synthétique

| Priorité | Fonctionnalité | Valeur | Effort | Dépend de (Roadmap 3) |
|---|---|---|---|---|
| 🥇 **#1** | Dashboard Direction | Très forte | 5j | Migration Drizzle v1 + Redis |
| 🥈 **#2** | PV de réception PDF/QR | Forte | 2j | — |
| 🥈 **#3** | Notifications push/SMS | Forte | 3j | Dashboard (pour éviter doublons) |
| 🥉 **#4** | Cash-flow fournisseurs | Moyenne | 3j | Dashboard (données) |

> 📝 **Note** : Toutes ces recommandations **réutilisent les briques existantes** (API /procurement, /daily-reports, Twilio, photos). **Aucune refactorisation lourde** n’est nécessaire — chaque feature est un ajout isolé.

---

## 🔄 Roadmap (Roadmap 3 — hors scope)

Pour accompagner ces features (non bloquantes mais bénéfiques) :

1. **Migration Drizzle ORM v1 + `@neondatabase/serverless` upgrade**
   - Objectif : passer aux versions LTS, corriger des deprecations (`neon-config`), préparer le cache Redis
   - Effort : 1-2 jours

2. **Cache Redis pour agrégats lourds**
   - Cache les endpoints Dashboard Direction + Suivi chantier (5 min TTL)
   - Effort : 1 jour

3. **Tests e2e isolés** (`.env.e2e.local` + base Neon dédiée)
   - Résout les échecs e2e "flaky" dus au partage de la base de dev
   - Effort : 1-2 jours
