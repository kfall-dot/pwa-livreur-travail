# Retex questionnaire — Service Achats & Finance (août 2026)

**Source :** réponses structurées aux 17 questions + règle de validation financière  
**Statut :** faits AS-IS confirmés — **corrige** plusieurs hypothèses du dossier TraceO  
**Document principal impacté :** [BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md](./BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md)

---

## Synthèse — ce qui change notre compréhension

| # | Sujet | Hypothèse documentée avant | Réalité confirmée | Impact TraceO |
|---|-------|---------------------------|-------------------|---------------|
| **F1** | Seuil **PDG** | 1 000 000 FCFA | **> 500 000 FCFA** → PDG ; **≤ 500 000** → DAF | Corriger config, workflows, exports |
| **F1c** | Moment validation DAF/PDG | Sur EB avant SA | **Sur BC après émission SA** | Réordonner workflow TraceO |
| **F14** | Base seuil 500 k | Montant EB estimé | **Montant final du BC** | Paramétrer sur `purchase_orders.total` |
| **F15** | Dossier BT | BT seul | **BC + BT + facture pro forma** obligatoire | Pièce jointe avant approbation finance |
| **F16** | Envoi BC fournisseur | Dès émission SA | **Après validation DAF/PDG** | Bloquer action SA avant `po_ready` |
| **F1b** | Déclenchement **BT** (trésorerie) | Seuil montant / espèces | **Pas de compte FADYM chez le fournisseur** (`has_account = false`) | Découpler BT et seuil PDG |
| **F2** | Contrôle financier vs livraison | (implicite) lien décaissement ↔ chantier souhaité | **Non** — finance vérifie décaissement + **reçu après achat** ; pas la concordance avec le chantier | **TraceO comble un vide** : preuve livraison ↔ BC |
| **F3** | Achats espèces | Chauffeur / livreur possible | **SA uniquement**, achat **en présentiel** ; monnaie → finance + reçu | Pas d’achat livreur ; tournée ≠ achat espèces |
| **F4** | Chauffeurs et monnaie | Reliquat chauffeur | **Les chauffeurs n’effectuent pas d’achats** | Retirer scénario « monnaie chauffeur » |
| **F5** | Achats hors circuit | Risque contournement DT/DAF | **Non** — tout passe par la procédure ; contrôle **finance + contrôleur de gestion** | Renforcer traçabilité, pas « shadow buying » |
| **F6** | Validations bloquées | Risque délais signature | **Non** — validation **WhatsApp** + **capture d’écran** jointe au dossier si absent | TraceO = formaliser une pratique existante |
| **F7** | Signature BC | Email possible | **SA ou DAF signe physiquement** ; DAF peut valider par WhatsApp | Joindre capture WA à l’étape approbation |
| **F8** | BC après achat | (chantiers privés ?) | **Jamais** — aucun achat sans BC préalable | Invariant strict à verrouiller |
| **F9** | Urgence EB | Variable | **Toute EB est considérée urgente** ; priorisation selon chantier | Pas de file « non urgente » ; priorité métier |
| **F10** | Livraison partielle | Découverte à réception | Fournisseur **appelle avant** ; **bon de livraison (BL)** à réception | Alerte partielle + saisie qtés BL / livreur |
| **F11** | Double commande | Risque | **Non** observé ; besoins stables par phase chantier | Garde anti-doublon reste utile mais risque faible |
| **F12** | Volume EB | Baseline | **Pas de comptage** — dépend cadence / phase chantier | Pilote = mesurer baseline |
| **F13** | Délai EB → BC | Longues files | Rédaction SA + validation DAF/PDG + **envoi photo BC** (post-validation) | Gain TraceO = ressaisie |
| **F14** | BL (bon de livraison) | Peu documenté | Délivré par le **fournisseur** à la livraison | Lier BL ↔ preuve TraceO ↔ qtés |

---

## Règles financières confirmées (août 2026)

### Validation par montant (sur le BC, après émission SA)

| Montant BC | Validateur |
|------------|------------|
| **≤ 500 000 FCFA** | **DAF** |
| **> 500 000 FCFA** | **PDG** |

*Applicable chantiers publics et privés. Le seuil s’applique au **montant final du BC** émis par le SA (confirmé août 2026), pas à l’EB estimée par le DT.*

### Bon de trésorerie (BT) — fiche trésorerie achats

| Condition | Document |
|-----------|----------|
| **FADYM n’a pas de compte** chez le fournisseur | **BT** + validation finance sur **BC + BT** + **facture pro forma** (pièce jointe) |
| FADYM a un **compte fournisseur** (`has_account = true`) | Pas de BT — achat à **crédit** ; tournée livreur possible |

**Important :** le BT **ne se déclenche pas** sur le seul montant. Il est lié à l’**absence de compte** chez le fournisseur. Le seuil **500 000 FCFA** concerne l’**approbation PDG du BC**, pas la production du BT.

**Prérequis TraceO :** renseigner le **fournisseur** sur l’EB avant émission BC pour générer le BT au bon moment.

---

## Ancienne note (corrigée)

~~La fiche BT se déclenche au seuil 1 M FCFA~~ — **incorrect**. Seuil PDG = **500 k** ; BT = **pas de compte fournisseur**.

---

## Réponses détaillées par thème

### Circuit et conformité

- **Aucun achat** en dehors du circuit DT → SA → BC → DAF/PDG.  
- **Contrôleur de gestion** + **service financier** : conformité du **décaissement** et du **reçu** post-achat.  
- **Pas de vérification** que le décaissé = matériel effectivement reçu sur chantier → **angle mort** que TraceO cible.

### Envoi BC au fournisseur (confirmé août 2026)

- Le SA **n’envoie pas** la photo BC au fournisseur avant validation DAF/PDG.
- **Après** approbation finance (`po_ready`) : envoi photo BC par **WhatsApp** (pratique actuelle conservée).

---

### Rôle du Service Achats et espèces

- Seul le **SA** est habilité à **effectuer les achats**.  
- Paiement **espèces** : achat **en présentiel** par le SA (pas le chauffeur).  
- Cas **BT** : dossier **BC + BT + facture pro forma** soumis au DAF/PDG avant achat.  
- **Monnaie** restituée au service financier avec **reçu de paiement**.

### Validations et délais

- Pas de commande **bloquée plusieurs jours** faute de signature.  
- Absence du signataire → validation **WhatsApp** + **capture d’écran** archivée sur la demande.  
- Retards liés surtout à **rupture stock fournisseur** ou **matériel en fabrication**, pas à l’interne.

### Livraison et documents

- **BC** émis par SA (montant **final**) ; dossier validé par DAF ou PDG (± BT + pro forma) ; envoi fournisseur **après** approbation.  
- **BL** fournisseur à la livraison — base de vérification des qtés.  
- Fournisseur **prévient par téléphone** en cas de livraison partielle.

### Métier chantier

- Besoins matériaux **globalement stables** par chantier selon **phases d’exécution**.  
- Toutes les EB traitées comme **urgentes** avec **priorisation** par niveau d’urgence chantier.

---

## Implications pour TraceO (recommandations ajustées)

### Renforcer (nouvelle valeur perçue)

1. **Lien BC → livraison prouvée → qtés chantier** — comble le trou entre finance (reçu) et terrain (réception).  
2. **Archivage capture WhatsApp** des validations DAF/PDG — digitalise une pratique existante.  
3. **Enregistrement BL** (photo / qtés) dans le dossier chantier.

### Corriger (spec / config)

1. Seuil PDG : **500 000 FCFA** (pas 1 M).  
2. **Pas de scénario** achat espèces par livreur.  
3. File « À planifier » espèces = **logistique livraison** après achat SA en présentiel, pas enlèvement payé par chauffeur.

### Inchangé (confirmé)

- WhatsApp central (validations, envoi photo BC fournisseur).  
- 1 BC avant tout achat.  
- Alerte livraison partielle utile (complète l’appel fournisseur + BL).  
- Déboursé sec ventilé DT → DAF (Q14 confirme procédure stricte).

---

## Acteurs AS-IS — mise à jour

| Acteur | Rôle approvisionnement (confirmé) |
|--------|-----------------------------------|
| Technicien | Exprime besoin — ne commande pas |
| DT | EB, validation métier |
| **DAF** | Validation dossier BC ≤ 500 k (± BT + pro forma) ; signature ou WA |
| **PDG** | Validation dossier BC > 500 k (± BT + pro forma) ; signature ou WA |
| **SA** | Émet BC ; joint pro forma si BT ; envoi photo BC fournisseur **après** validation ; achats espèces en présentiel |
| **Service financier** | Conformité décaissement + reçu |
| **Contrôleur de gestion** | Contrôle conformité (avec finance) |
| **Livreur / chauffeur** | **Livraison uniquement** — pas d’achat |
| Fournisseur | BL, appel si partiel |

---

## Décisions à revalider avec DAF

- [x] Seuil PDG **> 500 000 FCFA** sur **montant final BC**  
- [x] **BT** si **pas de compte** — dossier **BC + BT + pro forma** (confirmé août 2026)  
- [x] Envoi photo BC fournisseur **après** validation DAF/PDG (confirmé août 2026)  
- [ ] Fournisseur obligatoire sur EB **avant émission BC** pour génération BT — valider avec SA
- [x] Workflow espèces : SA émet BC → BT + pro forma → validation DAF/PDG → envoi fournisseur → achat présentiel → livraison TraceO

---

*Annexe à l’étude AS-IS — intégrer avant validation board finale.*
