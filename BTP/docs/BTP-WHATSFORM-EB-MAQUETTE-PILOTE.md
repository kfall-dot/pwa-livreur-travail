# Maquette WhatsForm — EB chantier pilote TraceO BTP

**Usage :** copier-coller dans le builder [WhatsForm](https://app.whatsform.com) pour un **POC rapide** (option **A8** du document board).  
**Chantier pilote :** Résidence Cocody — Tour A · **5 produits** · langue **Français (CI)**.

| | |
|---|---|
| **Version** | 1.0 — août 2026 |
| **Public** | SA, DT, intégrateur TraceO |
| **Lien doc board** | [BTP-OPTIONS-DIGITALISATION-EB-BOARD.md](./BTP-OPTIONS-DIGITALISATION-EB-BOARD.md) §10 (A8) |

---

## 1. Paramètres WhatsForm (Settings)

| Paramètre | Valeur recommandée |
|-----------|-------------------|
| **Nom du formulaire** | `TraceO EB — Résidence Cocody Tour A` |
| **Langue** | Français |
| **Numéro WhatsApp réception** | Numéro **TraceO Achats** (Meta prod ou test) |
| **URL slug** | `traceo-eb-cocody-tour-a` *(exemple)* |
| **Message de remerciement** | « Merci — votre besoin est transmis au DT. Vous recevrez un accusé dans le groupe. » |
| **Bouton Submit** | `Envoyer le besoin` |

**Partage pilote :** lien épinglé dans le groupe WhatsApp + QR imprimé au container.

---

## 2. Champs — ordre et libellés (Build)

Créer les questions **dans cet ordre**. Types = nomenclature WhatsForm (Title, Dropdown, Multiple Choice, Number, Text Input, Paragraph).

### Q0 — Title (accueil)

| Propriété | Texte |
|-----------|-------|
| **Titre** | Besoin matériaux — TraceO BTP |
| **Sous-titre** | Résidence Cocody — Tour A · 2 minutes · DT valide avant commande |

---

### Q1 — Dropdown · Chantier *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Quel chantier ? |
| **Placeholder** | Choisir le chantier |
| **Options** | `Résidence Cocody — Tour A` |
| **Note** | Pilote = 1 option ; multi-chantiers = ajouter une ligne par site |

**Clé webhook TraceO :** `site_name`

---

### Q2 — Multiple Choice · Type de besoin *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Type de besoin |
| **Options** | `Besoin courant (exécution)` · `Urgent — aujourd'hui` · `Complément livraison partielle` |
| **Autre** | Non |

**Clé webhook :** `eb_type`

---

### Q3 — Dropdown · Produit *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Quel produit ? |
| **Placeholder** | Choisir dans le catalogue pilote |
| **Options** | voir tableau §3 |

**Clé webhook :** `product_label`

---

### Q4 — Number · Quantité *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Quantité |
| **Placeholder** | Ex. 50 |
| **Min** | 1 |
| **Max** | 9999 |

**Clé webhook :** `quantity`

---

### Q5 — Dropdown · Unité *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Unité |
| **Options** | `sacs` · `barres` · `m³` · `tonnes` · `rouleaux` |
| **Note** | Pré-sélectionner l’unité attendue via aide Q3 (charte SA) |

**Clé webhook :** `unit`

---

### Q6 — Multiple Choice · Fournisseur habituel *(Optional)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Fournisseur habituel *(si vous savez)* |
| **Options** | `CimIvoire Distribution` · `Fer & Acier Abidjan` · `FADYM (espèces)` · `Je ne sais pas` |

**Clé webhook :** `supplier_hint`

---

### Q7 — Multiple Choice · Urgence livraison *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Quand en avez-vous besoin ? |
| **Options** | `Normal (2–3 jours)` · `Demain matin` · `Aujourd'hui — critique` |

**Clé webhook :** `urgency`

---

### Q8 — Text Input · Votre nom *(Required)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Votre nom (chef d'équipe) |
| **Placeholder** | Ex. Koné Yao |

**Clé webhook :** `requester_name`

---

### Q9 — Paragraph · Commentaire *(Optional)*

| Propriété | Valeur |
|-----------|--------|
| **Question** | Précisions *(optionnel)* |
| **Placeholder** | Ex. Livraison portail B, contact 07… |

**Clé webhook :** `comment`

---

## 3. Catalogue produits pilote (Q3)

| # | Libellé WhatsForm (option Q3) | Unité par défaut (Q5) | Fournisseur pilote |
|---|------------------------------|------------------------|--------------------|
| 1 | Ciment CPA 42,5 R | sacs | CimIvoire Distribution |
| 2 | Fer à béton 8 mm (barres 12 m) | barres | Fer & Acier Abidjan |
| 3 | Fer à béton 12 mm (barres 12 m) | barres | Fer & Acier Abidjan |
| 4 | Gravier 0/15 | m³ | *(SA désigne)* |
| 5 | Sable 0/4 | m³ | *(SA désigne)* |
| 6 | Autre — décrire en commentaire | *(saisie Q5)* | — |

> **Règle SA :** si « Autre », le DT **rejette ou complète** la ligne avant export fiche — pas de BC auto.

---

## 4. Message WhatsApp reçu (aperçu)

Après soumission, le numéro TraceO reçoit un récap du type :

```
📋 TraceO EB — Résidence Cocody Tour A
────────────────────────────
Chantier   : Résidence Cocody — Tour A
Type       : Besoin courant (exécution)
Produit    : Ciment CPA 42,5 R
Quantité   : 50 sacs
Fournisseur: CimIvoire Distribution
Urgence    : Demain matin
Demandeur  : Koné Yao
Commentaire: Livraison portail B 7h
────────────────────────────
Réponse #42 · 12/08/2026 14:32
De : +225 07 XX XX XX XX
```

---

## 5. Webhook TraceO (Settings → Integrations)

**Méthode :** `POST` · **Content-Type :** `application/json`  
**URL (exemple dev) :** `https://<site>.netlify.app/api/procurement/whatsform-webhook`  
*(endpoint à implémenter — POC peut logger + créer brouillon EB manuellement)*

### Mapping clés → payload TraceO

| Clé WhatsForm | Champ TraceO (`eb_draft`) |
|---------------|---------------------------|
| `site_name` | `siteName` → résolution `site_id` |
| `eb_type` | `kind` (`standard` / `urgent` / `complement`) |
| `product_label` | `lines[0].label` |
| `quantity` | `lines[0].quantity` |
| `unit` | `lines[0].unit` |
| `supplier_hint` | `metadata.supplierHint` |
| `urgency` | `metadata.urgency` |
| `requester_name` | `metadata.requesterName` |
| `comment` | `notes` |
| `response_time` *(auto WhatsForm)* | `sourceSubmittedAt` |
| `Delivered to` *(auto)* | audit |

### Exemple JSON reçu côté serveur

```json
{
  "site_name": "Résidence Cocody — Tour A",
  "eb_type": "Besoin courant (exécution)",
  "product_label": "Ciment CPA 42,5 R",
  "quantity": "50",
  "unit": "sacs",
  "supplier_hint": "CimIvoire Distribution",
  "urgency": "Demain matin",
  "requester_name": "Koné Yao",
  "comment": "Livraison portail B 7h",
  "response_time": "2026-08-12T14:32:00Z"
}
```

### Règle métier TraceO

1. Webhook → **brouillon EB** statut `draft` ou `submitted` selon charte.  
2. **DT valide toujours** dans TraceO (pas de BC auto).  
3. Accusé optionnel dans le groupe WA via bot TraceO : « EB-xxx reçue — en revue DT ».

---

## 6. Charte terrain (message à poster dans le groupe)

```
📌 BESOIN MATÉRIaux
Utilisez le formulaire (lien épinglé) pour ciment, fer, gravier, sable.
→ 30 secondes, pas de ressaisie par le DT.
Urgence absolue : écrivez aussi dans le groupe + formulaire.
Lien : https://whatsform.com/xxxxxxxx
```

---

## 7. Checklist mise en service POC

- [ ] Formulaire publié + test submit depuis 2 téléphones
- [ ] Webhook reçu côté TraceO (ou Webhook.site en test)
- [ ] Mapping `site_name` → `site-btp-pilote-1`
- [ ] DT formé : valider brouillon ≤ 2 h ouvrées
- [ ] Lien épinglé groupe + QR container
- [ ] Voie secours **A2** (message libre) documentée si lien inaccessible

---

*TraceO® BTP — Maquette WhatsForm pilote — août 2026*
