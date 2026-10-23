# Décisions DT — validées (août 2026)

**Statut :** validé par le directeur technique  
**Périmètre :** pilote `co-btp-pilote`  
**Documents impactés :** [Circuit achats](./BTP-REGLES-CIRCUIT-ACHATS.md) · [Stock](./BTP-REGLES-STOCK-CHANTIER.md) · [Tournées / livraisons](./BTP-REGLES-TOURNEES-BC.md) · [Index BTP](./BTP-INDEX.md)

---

## D5 — Circuit DT : revue terrain → DT → SA (I110)

### Règle

Une EB WhatsApp créée par le **Chef Chantier (CDC)** est d'abord soumise au **statut `dt_review`** (revue technique). Le DT approuve ensuite :

| Famille de charge | Statut après DT | Circuit suivant |
|-------------------|-----------------|-----------------|
| Matériaux (ciment, fer, sable…) | `submitted` | SA → CdG → DAF |
| Hors SA (main-d'œuvre, engins, frais) | `cdg_review` | CdG → DAF → trésorerie |

### Quand le DT soumet lui-même

Si le **DT** soumet l'EB directement (ex. déboursé sec ventilé), le statut initial est :

- `submitted` (matériaux) ou `cdg_review` (hors SA) — **pas** d'étape `dt_review`.

### Séquence complète (matériaux)

```
CDC soumet draft  →  dt_review  (notifie DT)
DT approuve       →  submitted  (notifie SA)
SA chiffre + envoie au CdG  →  cdg_review  (notifie CdG)
CdG approuve      →  daf_review  (notifie DAF)
DAF approuve (< 500 K)  →  sa_review  (notifie SA → émission BC)
```

### Implémentation

| Artefact | Transition |
|----------|-----------|
| `server/routes/procurement.ts` `/drafts/:id/submit` | `requireProcurementRole('technical_director', 'site_manager')` ; `initialStatus` = `dt_review` si soumission par un non-DT |
| `server/services/procurementWorkflow.ts` `approvePurchaseRequest` | `case 'dt_review'`: `horsSa → cdg_review / sinon submitted` |
| `shared/chargeFlow.ts` `isHorsSaFlow` | déclencheur du routage matériaux vs hors SA |
| `e2e/btp-helpers.ts` | `terrainSubmitDraft` (CDC) + `dtApproveRequest` (DT) |

---

## Synthèse des 4 arbitrages

| # | Question | Décision DT | Implication TraceO |
|---|----------|-------------|-------------------|
| **D1** | Contenu EB **déboursé sec** au lancement | **Montant global ventilé en lignes produits** par le DT — condition d’approbation DAF | Lignes obligatoires (produit, qté, unité, montant ligne) ; `total_amount_fcfa` = somme des lignes ; soumission DAF **bloquée** si ventilation absente ou incohérente |
| **D2** | Canal **journal quotidien** technicien (matin / soir) | **WhatsApp** pour le moment | Pont transfert / messages structurés ; pas de formulaire PWA technicien en pilote |
| **D3** | Canal **alertes livraison** (partiel / total) | **WhatsApp + dashboard** | Notification push manager **et** message WhatsApp DT (ou groupe selon config) |
| **D4** | Qui définit les **seuils stock** par produit / chantier ? | **DT** | CRUD seuils réservé au rôle DT ; SA lecture seule |

---

## D1 — Déboursé sec : montant global ventilé par le DT

### Règle

Au **lancement du chantier**, le DT crée une EB type `debourse_sec` représentant l’**enveloppe de démarrage**. Ce montant global doit être **ventilé en lignes produits** par le DT **avant** soumission au DAF — le DAF n’approuve pas un forfait sans détail.

| Champ | Obligatoire | Exemple |
|-------|-------------|---------|
| `site_id` | Oui | Résidence Lilas |
| `eb_type` | `debourse_sec` | — |
| **Lignes produits** | **Oui** — min. 1 ligne | Ciment 200 sacs, Fer 12 mm 50 barres, Sable 30 m³… |
| Par ligne | libellé, qté, unité, **montant ligne** (ou PU × qté) | Ciment — 200 sacs — 1 200 000 FCFA |
| `total_amount_fcfa` | **Oui** — = **Σ montants lignes** | 5 000 000 FCFA |
| `notes` | Recommandé | *« Déboursé sec lancement — fondations phase 1 »* |
| Fournisseur | Optionnel à l’EB | Requis au BC (SA) |

### Contrôles avant envoi DAF

| Contrôle | Règle |
|----------|-------|
| C1 | Au moins **1 ligne** avec libellé + qté > 0 + unité |
| C2 | Chaque ligne a un **montant** (ou PU calculable) |
| C3 | `total_amount_fcfa` = **somme exacte** des montants lignes |
| C4 | Ventilation **saisie par le DT** — pas par le SA ni le DAF |

**Si C1–C3 non respectés :** bouton « Soumettre au DAF » **désactivé** + message *« Ventilez le montant en lignes produits »*.

### Export fiche besoin achat (SA)

L’export reprend **toutes les lignes** ventilées par le DT (pas une ligne forfait unique) :

| Libellé | Qté | Unité | Montant ligne |
|---------|-----|-------|---------------|
| Ciment | 200 | sacs | 1 200 000 |
| Fer 12 mm | 50 | barres | 800 000 |
| Sable | 30 | m³ | 900 000 |
| … | | | |
| **Total déboursé sec** | | | **5 000 000** |

---

## D2 — Journal quotidien : WhatsApp uniquement (pilote)

| Moment | Format WhatsApp attendu | Effet |
|--------|-------------------------|-------|
| **Matin** | `Plan jour [chantier]` + liste tâches | Journal `plan_jour` |
| **Soir** | `Bilan jour [chantier]` + réalisé + matériel utilisé | Journal `bilan_jour` + stock `OUT` |

**Hors pilote :** formulaire PWA technicien — non planifié tant que WhatsApp n’est pas adopté à ≥ 80 %.

---

## D3 — Alertes livraison : double canal

| Événement | Dashboard DT | WhatsApp DT |
|-----------|--------------|-------------|
| Livraison totale | Récap dans dossier chantier | Message informatif |
| Livraison **partielle** | Badge prioritaire + file actions | **Alerte immédiate** |
| Livraison refusée | Alerte | Alerte |

**Numéro / groupe WhatsApp DT :** à configurer à l’onboarding pilote.

---

## D4 — Seuils stock : propriété DT

| Action | DT | SA | Technicien |
|--------|----|----|------------|
| Définir `seuil_min` / `seuil_cible` | ✓ | lecture | — |
| Modifier seuils en cours de chantier | ✓ | — | — |
| Recevoir alerte sous-seuil | ✓ (WhatsApp + dashboard) | lecture | — |
| Valider EB suggérée depuis alerte | ✓ | — | — |

**Calibrage initial :** DT renseigne les seuils pour les **3 à 5 produits** du pilote avant la première livraison (phase S1).

---

## Prochaines validations (hors DT)

| Sujet | Valideur | Statut |
|-------|----------|--------|
| Circuit déboursé sec ventilé → SA → BC → DAF/PDG | DAF | À confirmer |
| Format lignes + montants sur fiche EB export | SA | À confirmer |
| Numéro WhatsApp alertes DT | Admin / Meta | À configurer |
| Seuil PDG / BT **500 000 FCFA** sur **montant BC** | Board / DAF | ✓ Confirmé finance août 2026 |
| Dossier BT : **BC + BT + pro forma** | DAF | ✓ Confirmé finance août 2026 |
| Envoi BC fournisseur **post-validation** | SA | ✓ Confirmé finance août 2026 |
| Collage + validation EB WhatsApp | Rôles **DT** et **SA / assistant** (pas de distinction public/privé chantier) | ✓ Produit août 2026 |
| F01 budget chantier — rôle, avenant, warning, PDG | Voir [spéc F01](./BTP-SPEC-F01-FICHE-CHANTIER-BUDGET.md) §5 : CdG gèle l’enveloppe ; **DT propose / DAF approuve** l’avenant ; warning si dépassement ; pas de PDG sur avenant. D-F01-4 warning provisoire. | ✓ Direction 19 août 2026 (avenant DAF) |
| CDC F08 / F10 | Comptabilité générale ; marchés ST / RG | **Hors TraceO** — [synthèse §4](./BTP-SYNTHESE-EXECUTIVE-DIRECTION.md) |

---

## Avenant D1 (correction août 2026)

*Précision suite échange DT : le déboursé sec reste une **enveloppe globale** de démarrage, mais le DT doit **obligatoirement ventiler** cette enveloppe en **lignes produits** pour obtenir l’approbation du DAF — ce n’est pas le SA qui ventile à l’étape BC.*

---

*Fiche de référence — toute modification ultérieure fait l’objet d’un avenant daté.*
