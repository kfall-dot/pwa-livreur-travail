# TraceO Achats Chantier — Deck board gestionnaires (14 diapositives)

**Document complet :** [`BTP-PRESENTATION-BOARD.md`](BTP-PRESENTATION-BOARD.md)  
**Index BTP :** [`BTP-INDEX.md`](BTP-INDEX.md) — table des matières  
**Synthèse CDC :** [`BTP-SYNTHESE-EXECUTIVE-DIRECTION.md`](BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) (F01–F07, F09 · hors F08, F10)  
**Règles tournées :** [`BTP-REGLES-TOURNEES-BC.md`](BTP-REGLES-TOURNEES-BC.md)  
**Règles stock :** [`BTP-REGLES-STOCK-CHANTIER.md`](BTP-REGLES-STOCK-CHANTIER.md)  
**Modèles SA :** `docs/originaux/*.xlsx`

## Mode d’emploi — réunion board

| Contexte | Support | Slides |
|----------|---------|--------|
| **Board 60 min** | Ce deck + document complet en annexe | 01 → 14 |
| **Board 30 min** | Version courte | 01–02, 04–06, 09–11, 14 |
| **Après réunion** | PDF `BTP-PRESENTATION-BOARD.md` + fiches règles | leave-behind |

**Chronologie 60 min :** accroche (01–02) · AS-IS (03–04) · TO-BE (05–06) · choix (07–08) · roadmap & risques (09–10) · décisions (11–12) · clôture (13–14).

**Couleurs TraceO :** vert `#0b4a2c`, accent `#e85d04`, fond `#f4f2ee`

---

## Slide 1 — Titre

**Titre principal :**  
Du message WhatsApp à la preuve sur chantier  
**sans ressaisir trois fois la même commande**

**Sous-titre :**  
TraceO® Achats Chantier — Présentation au board des gestionnaires

**Métadonnées (coin bas) :**  
Pilote BTP · Côte d’Ivoire · Document v1.1 · CDC F01–F07, F09 (hors F08, F10)

**Notes présentateur :** Poser la question : *« Combien de fois la même quantité de ciment est-elle tapée dans Excel, WhatsApp et au téléphone du livreur ? »* — ne pas ouvrir avec la technique.

---

## Slide 2 — Pourquoi nous réunissons ce board

**Titre :**  
Pourquoi ce sujet maintenant

**4 bullets :**

- **WhatsApp** = canal n°1 chantier — **non négociable**
- Circuit achats sur **Excel** (EB, BT, registre BC) — **charge et erreurs**
- **Ruptures matériaux** = arrêt chantier + surcoût urgence
- **TraceO** prouve déjà les livraisons — il manque le **fil achats → camion → chantier**

**Message clé (encadré) :**  
*Ce n’est pas un nouvel ERP. C’est l’extension logique de ce que nous avons déjà.*

**Notes présentateur :** Rappeler que le prototype existe en local — la décision du jour est **pilote oui/non**, pas « faisabilité technique ».

---

## Slide 3 — Situation actuelle (AS-IS)

**Titre :**  
Comment ça marche aujourd’hui

**Schéma (horizontal simplifié) :**

```
Technicien → WhatsApp groupe → DT (ressaisie) → Fiche EB Excel
    → SA émet BC + Registre Excel → DAF ou PDG valide BC (BT si pas compte)
    → Livraison (souvent hors lien BC) → ?
```

**3 documents SA (icônes) :**

| Fiche besoin achat | Fiche trésorerie | Points fournisseurs BC |
|--------------------|------------------|-------------------------|
| EB / DT | BT / DAF-PDG | 1 ligne = 1 BC |

**Notes présentateur :** Montrer un extrait registre (UBH, plusieurs chantiers même jour) — ancrage concret.

---

## Slide 4 — Les 6 douleurs qui nous coûtent cher

**Titre :**  
Ce qui ne va pas — et ce que ça coûte

| Douleur | Conséquence |
|---------|-------------|
| **Double saisie** WhatsApp → Excel | Erreurs qté, retard DT |
| **Pas de statut** « où en est ma commande ? » | Relances, bruit groupe |
| **BC déconnecté** de la livraison | Pas de preuve structurée |
| **Registre ressaisi** à la main | Charge SA, incohérences |
| **Ruptures stock** | Chantier à l’arrêt |
| **Multi-BC / 1 fournisseur** | Camions ou trajets mal coordonnés |

**Citation :**  
*« Le problème n’est pas l’achat. C’est la chaîne cassée entre le besoin et la réception prouvée. »*

---

## Slide 5 — Vision cible (TO-BE)

**Titre :**  
La cible en une phrase

**Corps (grande flèche) :**

```
Lancement → EB déboursé sec ventilée (DT→DAF) → SA → BC
Exécution → WhatsApp → EB → DT → SA → BC → DAF/PDG
    → Tournée → Livraison (alerte si partiel) → Stock
    → Bilan soir technicien → Alerte seuil → EB anticipée
```

**5 principes (icônes) :**

1. WhatsApp **reste** le canal terrain (plan matin + bilan soir)  
2. **Déboursé sec** au lancement — DT **ventile en lignes** → DAF approuve → SA  
3. DT **informé** livraisons partielles / totales  
4. SA **génère** les fiches Excel, ne les retape pas  
5. Stock **mis à jour** chaque soir (matériel utilisé) + alertes seuil  

**Notes présentateur :** Insister : *validation humaine aux points d’audit* — pas de robot qui commande seul.

---

## Slide 6 — Ce que chaque rôle y gagne

**Titre :**  
Avant / Après par métier

| Rôle | Avant | Après |
|------|-------|-------|
| **Technicien** | Message perdu | Accusé + statut groupe |
| **DT** | Saisie EB | Révision brouillon 1 clic |
| **DAF / PDG** | Pièces dispersées | File d’approbation tracée |
| **SA** | 3 Excel + appels livreur | BC + registre auto ; exceptions ciblées |
| **Livreur** | Consignes orales | PWA : dépôt fournisseur → chantier |
| **Direction** | Vision partielle | Tableau de bord bout en bout |

**Notes présentateur :** Demander au SA : *« Combien de lignes registre par semaine ? »* — ancrage charge.

---

## Slide 7 — Choix stratégiques (1/2)

**Titre :**  
Pourquoi ces choix — pas d’autres

| Choix | Pourquoi |
|-------|----------|
| **Pont WhatsApp** (transfert / réponse au n° TraceO) | API Meta : lecture groupe **non garantie** ; pont = fiable + 30 s formation |
| **IA → brouillon**, DT valide toujours | Audits ; pas d’hallucination qté en achat |
| **Excel SA conservé** (exports auto) | Adoption SA ; continuité compta |
| **1 BC = 1 chantier** | Budget / registre inchangés |

**Notes présentateur :** Ne pas promettre « bot qui lit tout le groupe ».

---

## Slide 8 — Choix stratégiques (2/2)

**Titre :**  
Logistique & stock

| Choix | Pourquoi |
|-------|----------|
| **Tournée auto** à l’émission BC | Moins d’oublis ; BC = engagement |
| **N BC → 1 tournée** (même fournisseur) | Réalité UBH → plusieurs chantiers |
| **File « À planifier »** (espèces, particulier) | Registre montre cas non standard |
| **Stock à la livraison** confirmée | Pas de stock « papier » |
| **Alerte → EB suggérée**, pas commande auto | DT garde la main ; anti-rupture |

**Seuil PDG :** **500 000 FCFA** (paramétrable) — aligné fiche trésorerie.

---

## Slide 9 — Roadmap pilote

**Titre :**  
Phasage — on ne fait pas tout le jour 1

| Phase | Contenu | Durée |
|-------|---------|-------|
| **0** | Validation board + charte WhatsApp | 2 sem |
| **1** | WhatsApp → EB → BC → tournée + exports SA | 8–12 sem |
| **1b** | Consolidation multi-BC | +2–4 sem |
| **2** | Stock : entrée auto + seuils | +4 sem |
| **3** | Commande anticipée (EB suggérée) | +4 sem |

**Encadré :**  
*Phase 1 = pilote 1 chantier · 3–5 produits stock en phase 2*

**État aujourd’hui :** prototype technique local — **pas en production**

---

## Slide 10 — Risques & mitigations

**Titre :**  
Ce qui peut mal tourner — et comment on s’en protège

| Risque | Mitigation |
|--------|------------|
| Techniciens n’utilisent pas le pont | Formation 5 min ; accusés visibles ; DT relais 2 sem |
| IA se trompe | DT obligatoire ; message original affiché |
| Résistance SA | Exports Excel identiques aux modèles actuels |
| Coût Meta / IA | Budget plafonné pilote |
| Stock imprécis | Relevé « il reste X » ; seuils conservateurs |
| Périmètre trop large | **Gel** : 1 chantier, pas d’ERP |

---

## Slide 11 — KPI de succès pilote (3 mois)

**Titre :**  
Comment on saura que ça marche

| Indicateur | Cible |
|------------|-------|
| EB sans ressaisie DT (cas standard) | ≥ **70 %** |
| BC crédit → tournée sans action SA | ≥ **80 %** |
| Livraisons avec preuve photo | ≥ **90 %** |
| Ruptures non anticipées (chantier pilote) | **< 2** |
| Satisfaction DT / SA | ≥ **4/5** |

**Revue board :** J+30 et J+90

---

## Slide 12 — Décisions attendues aujourd’hui

**Titre :**  
Ce que nous vous demandons de trancher

**Cases à remplir en séance :**

- [ ] **Lancer le pilote** Achats chantier (oui / non / reporter)
- [ ] **Chantier pilote :** _______________________
- [ ] **Pont WhatsApp** transfert/réponse — 3 mois (oui / non)
- [ ] **Seuil PDG :** 500 000 FCFA (autre : _______)
- [ ] **Budget pilote** WhatsApp + IA : _______ FCFA/mois
- [ ] **Référent Meta Business :** _______________________
- [ ] **Owner DT :** _______ · **Owner SA :** _______
- [ ] **Stock phase 2** avec premières livraisons (oui / reporter)

**Notes présentateur :** Laisser 15 min discussion sur cette slide. Tout le reste est annexe.

---

## Slide 13 — Investissement & effort humain

**Titre :**  
Ce que le pilote demande (hors dev)

| Poste | Effort |
|-------|--------|
| **Meta WhatsApp** | Vérification entreprise + numéro dédié |
| **Formation terrain** | ½ journée techniciens + DT |
| **SA** | Paramétrage fournisseurs + seuils stock |
| **Pilotage** | Point hebdo 4 semaines (30 min) |
| **Licence ERP** | **Aucune** — extension TraceO existant |

**Message :**  
*On réutilise la PWA livreur et le dashboard — pas un second logiciel à acheter.*

---

## Slide 14 — Clôture & recommandation

**Titre :**  
Recommandation

**Corps :**

> Valider le **pilote phase 1** sur **1 chantier**, avec le **pont WhatsApp**, tenant isolé, et **revue à 30 jours** avant extension multi-sites.

**3 rappels :**

1. WhatsApp **reste** — on l’industrialise  
2. DT **garde** la responsabilité métier  
3. TraceO **relie** achat et preuve livraison  

**Contact / suite :**  
Document complet + règles métier en annexe · Prochaine étape : charte pilote + ouverture Meta Business

**Notes présentateur :** Remercier. Envoyer `BTP-PRESENTATION-BOARD.pdf` sous 24 h.

---

## Annexe slides — FAQ rapide (si questions)

**Q : Pourquoi pas un ERP ?**  
R : TraceO couvre F01–F07 et F09 (achats, enveloppe, avancement). **F08** (compta SYSCOHADA) et **F10** (marchés ST / RG) restent hors périmètre.

**Q : Le bot lit tout le groupe ?**  
R : Non en pilote — transfert/réponse au numéro TraceO.

**Q : Qui contrôle les tournées ?**  
R : Création auto au BC (règles) ; replan manager si besoin ; livreur exécute seulement.

**Q : Et le stock ?**  
R : Phase 2 après livraisons fiables ; alerte + EB suggérée, pas commande silencieuse.

**Q : Données séparées du démo ?**  
R : Oui — tenant `co-btp-pilote` isolé.

---

*Deck dérivé de BTP-PRESENTATION-BOARD.md — adapter noms et chiffres avant projection.*
