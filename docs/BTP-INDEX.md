# Index documentation BTP — TraceO Achats chantier

**Public :** direction, board, DT, DAF, SA, CdG, équipe produit  
**Périmètre :** tenant pilote `co-btp-pilote`  
**CDC Fadym :** F01–F07 et F09 dans TraceO · **F08 et F10 hors périmètre** (ERP / marchés ST)

---

## Table des matières

1. [Documents direction / board](#1-documents-direction--board)
2. [Règles métier](#2-regles-metier)
3. [Spécifications CDC](#3-specifications-cdc)
4. [WhatsApp, options EB, retex](#4-whatsapp-options-eb-retex)
5. [Couverture F01–F10](#5-couverture-f01-f10)
6. [Produit & qualité](#6-produit--qualite)

---

## 1. Documents direction / board

| Document | Rôle |
|----------|------|
| [BTP-SYNTHESE-EXECUTIVE-DIRECTION.md](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) | **Synthèse exécutive** — PDF `TraceO_BTP-Synthese-Executive-Direction.pdf` |
| [BTP-PRESENTATION-BOARD.md](./BTP-PRESENTATION-BOARD.md) | Présentation board (situation → cible) |
| [BTP-PRESENTATION-BOARD-SLIDES.md](./BTP-PRESENTATION-BOARD-SLIDES.md) | Notes de slides |
| [BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md](./BTP-ETUDE-EXISTANT-DIAGNOSTIC-RECOMMANDATIONS.md) | Étude AS-IS / diagnostic / TO-BE |
| [BTP-OPTIONS-DIGITALISATION-EB-BOARD.md](./BTP-OPTIONS-DIGITALISATION-EB-BOARD.md) | Options A1–A8 digitalisation EB |

Régénérer le PDF synthèse : `npm run presentation:btp-synthese-pdf`

---

## 2. Règles métier

| Document | Rôle |
|----------|------|
| [BTP-DECISIONS-DT-VALIDEES.md](./BTP-DECISIONS-DT-VALIDEES.md) | Arbitrages DT D1–D4 + F01 (CdG / DAF) |
| [BTP-REGLES-CIRCUIT-ACHATS.md](./BTP-REGLES-CIRCUIT-ACHATS.md) | EB, déboursé sec, DAF/PDG, BT |
| [BTP-REGLES-TOURNEES-BC.md](./BTP-REGLES-TOURNEES-BC.md) | BC → tournée livreur |
| [BTP-REGLES-STOCK-CHANTIER.md](./BTP-REGLES-STOCK-CHANTIER.md) | Stock site, seuils, IN/OUT |

---

## 3. Spécifications CDC

| Document | CDC | État |
|----------|-----|------|
| [BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md) | **F01** | F01.1 développé hors prod |
| *(à rédiger avant code)* | F02 natures de charge | Après F01 |
| *(à rédiger avant code)* | F03 / F04 / F09 | Après F01+F02 |
| [BTP-WHATSAPP-DOSSIER-CHANTIER.md](./BTP-WHATSAPP-DOSSIER-CHANTIER.md) | F05, F07 | Décision WhatsApp (D2) |

---

## 4. WhatsApp, options EB, retex

| Document | Rôle |
|----------|------|
| [BTP-WHATSAPP-DOSSIER-CHANTIER.md](./BTP-WHATSAPP-DOSSIER-CHANTIER.md) | Intrant WhatsApp + dossier chantier |
| [BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md](./BTP-WHATSFORM-EB-MAQUETTE-PILOTE.md) | Maquette WhatsForm |
| [BTP-RETEX-QUESTIONNAIRE-FINANCE-2026.md](./BTP-RETEX-QUESTIONNAIRE-FINANCE-2026.md) | Questionnaire SA / finance |

Cahier des charges source : `docs/originaux/Cahier_des_charges_ERP_Fadym.docx`

---

## 5. Couverture F01–F10

| ID | Dans TraceO ? | Doc de référence |
|----|---------------|------------------|
| F01 Budget + avenants | Oui | [Spéc. F01](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md) · [Synthèse §4](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) |
| F02 Natures de charge | Oui (backlog) | Synthèse §4–§5 |
| F03 Budget vs réalisé | Oui (backlog) | Synthèse §4–§5 |
| F04 % financier | Oui (backlog) | Synthèse §4–§5 |
| F05 Avancement physique | Oui (WhatsApp) | [WhatsApp dossier](./BTP-WHATSAPP-DOSSIER-CHANTIER.md) |
| F06 Alertes dérive | Oui (backlog) | Synthèse §4–§5 |
| F07 Saisie terrain | Oui via WhatsApp | [Décisions DT D2](./BTP-DECISIONS-DT-VALIDEES.md) |
| **F08** Comptabilité générale | **Non** | ERP — hors TraceO |
| F09 Dashboard multi-chantiers | Oui (backlog) | Synthèse §4–§5 |
| **F10** Marchés ST / RG | **Non** | Juridique / ERP — hors TraceO |

---

## 6. Produit & qualité

| Document | Rôle |
|----------|------|
| [FONCTIONNALITES.md](./FONCTIONNALITES.md) | Capacités du dépôt (livreur + manager + Achats BTP) |
| [e2e/INVARIANTS.md](../e2e/INVARIANTS.md) | Invariants E2E (I01–I72 dont F01 I66–I72) |
| [SUPPORT-PILOTE.md](./SUPPORT-PILOTE.md) | Support éditeur pilote |
| [CONFIGURATION-PILOTE.md](./CONFIGURATION-PILOTE.md) | Config Netlify / env |
