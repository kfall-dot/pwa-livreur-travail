# Plan — Session Zustand (state procurement partagé)

> Date : 14/09/2026 · Statut : **planifié, non démarré**
> Objectif : supprimer le mécanisme `key={...-refreshKey}` (remount forcé) au profit d'un
> store partagé Zustand pour le domaine **registre BC** uniquement.

---

## 1. Constat factuel (audit du code au 14/09/2026)

### Le mécanisme actuel de rafraîchissement

```
ManagerDashboardPage.tsx
  const [suiviRefreshKey, setSuiviRefreshKey] = useState(0)   // ligne 108

  # 3 endroits incrémentent :
  #   ligne 113 : callback générique (activité)
  #   ligne 567 : bouton header
  #   ligne 590 : bouton header

  # Puis on démonte TOUS les onglets via key={} :
  key={`suiviBc-${suiviRefreshKey}`}        (SuiviBcTab)
  key={`comptabilite-${suiviRefreshKey}`}   (ComptabiliteTab)
  key={`achats-${suiviRefreshKey}`}         (AchatsTab)
  key={`suiviChantier-${suiviRefreshKey}`}  (+ refreshKey en double)
  key={`suivi/maJournee/livreurs/...`}      (tous les autres)
```

**Problèmes** :
1. Un clic incrémente le key → **tous** les onglets remontent → tous refetch,
   même ceux qui n'ont rien à voir avec l'action.
2. Historique de bugs directs : tuiles figées (Suivi BC, tuiles CdG), champ N° FACTURE
   perdu (state local détruit par le remount).
3. La navigation entre onglets déclenche aussi le remount → perte des états locaux
   (filtres actifs, scroll, brouillon de saisie).

### Ce qui circule entre la page et les onglets

| Prop | Onglets concernés | Verdict |
|---|---|---|
| `handleAuth` (gestion 401/403) | tous | ✅ légitime, reste tel quel (concern page, pas data) |
| `refreshKey` | SuiviChantierTab, SuiviTab, tous via `key` | ❌ à remplacer par le store |
---

## 2. Périmètre de la session — VOLONTAIREMENT ÉTROIT

**Un seul domaine** : le **registre BC** (celui qui a produit les bugs de tuiles figées
et le bug du bouton Transmettre). Les autres domaines (livraisons, équipe, tâches,
catalogue) restent en l'état — une éventuelle phase 2 les traitera plus tard.

### Fichiers touchés (liste fermée)
| Fichier | Changement |
|---|---|
| `src/stores/procurementStore.ts` | **NOUVEAU** — le store |
| `src/pages/manager/procurement/SuiviBcTab.tsx` | lit/écrit le store au lieu de son `useState` local |
| `src/pages/manager/procurement/ComptabiliteTab.tsx` | idem |
| `src/pages/ManagerDashboardPage.tsx` | retire `key={suiviBc-...}` et `key={comptabilite-...}` |

### Ce qui NE bouge PAS (engagement)
- `AchatsTab`, `SuiviChantierTab`, `MaJourneeTab`, EquipeTab, SuiviTab, PlanifierTab, PointsTab, TachesTab
- Aucun changement visuel (aucune classe, aucune colonne, aucun texte)
- `handleAuth`, `procurementRole`, les routes API : inchangés · Aucun changement serveur

---

## 3. Design du store

```ts
// src/stores/procurementStore.ts
import { create } from 'zustand'

interface ProcurementState {
  bcRows: BcRegisterRow[]
  bcMonths: string[]
  bcMonth: string            // mois courant (navigation mensuelle)
  bcLoading: boolean
  bcStale: boolean           // remplace refreshKey

  setBcMonth: (month: string) => void
  loadBc: (handleAuth: (s: number) => boolean) => Promise<void>
  markBcStale: () => void     // appelé par AchatsTab/SA après une modification
  patchBcRow: (id: string, patch: Partial<BcRegisterRow>) => void
}
```

**Clé du design** : `patchBcRow` fait la mise à jour **locale et instantanée** (toggle
Payée, numéro de facture, transmission) après confirmation du serveur — c'est ce qui
rend les tuiles naturellement à jour dans tous les onglets, sans refetch.

---

## 4. Phases et jalons

| # | Étape | Critère de succès |
|---|---|---|
| 0 | `npm install zustand` + baseline | 168 tests verts avant toute modif |
| 1 | Store + `SuiviBcTab` migré | SuiviBcTab identique à avant |
| 2 | `ComptabiliteTab` migré | Le comptable voit la facture SA **sans refresh** |
| 3 | Retrait des `key` (2 onglets) | Plus de remount sur ces 2 onglets |
| 4 | Tests auto | tsc 0 err · lint 0 err · 168 tests · build OK |
| 5 | **Tests manuels** (§5) | Tous les parcours validés |
| 6 | Push prod + vérif Railway | commit poussé |
---

## 5. Parcours de validation manuels (obligatoires avant push)

| # | Parcours | Attendu |
|---|---|---|
| 1 | SA : saisir n° facture → changer d'onglet → revenir | le n° est conservé (plus de perte au remount) |
| 2 | SA : toggle Payée | badge change instantanément |
| 3 | SA : Transmettre → aller dans Comptabilité | statut "Reçu" visible **sans action** |
| 4 | CMPT : changer de mois | tuiles + tableau + répartitions suivent |
| 5 | CMPT : filtres fournisseur/mode | tableau filtré, tuiles inchangées (choix C validé) |
| 6 | AchatsTab : créer un BC → Suivi BC | la liste est à jour (via `markBcStale`) |
| 7 | Navigation rapide entre onglets | pas de flash/disparition de contenu |
| 8 | Déconnexion / reconnexion | données rechargées, pas d'état résiduel |

---

## 6. Risques et mitigeations

| Risque | Mitigation |
|---|---|
| État stale après une mutation serveur | `patchBcRow` appelé **après** confirmation du serveur, jamais en optimiste |
| Deux onglets avec le même mois mais des données divergentes | Une seule source : le store. Les onglets n'ont plus leur propre `useState` rows |
| Perte du `suiviRefreshKey` pour les AUTRES onglets | On ne touche pas aux autres onglets — leur `key` reste |
| Conflit avec `refreshKey` prop de SuiviChantierTab | Hors périmètre — inchangé |

---

## 7. Estimation

| Phase | Durée |
|---|---|
| 0–2 (store + 2 onglets) | ~2 h |
| 3 (retrait keys) | ~30 min |
| 4 (tests auto) | ~15 min |
| 5 (tests manuels) | ~30 min |
| **Total** | **≈ 3 h** — une session, push uniquement en fin |


**Règle d'arrêt** : si une seule case du §5 échoue → analyse avant tout push. En cas de
doute persistant, `git revert` propre (le visuel n'aura pas bougé, aucun impact UI).

| `onInboxCountChanged` | AchatsTab → page (badge) | ⚠️ store phase 2 |
| `onPointsChanged` (`bumpCatalog`) | PointsTab → page | ⚠️ store phase 2 |
| `procurementRole` | SuiviChantierTab, AchatsTab | ✅ légitime (contexte session) |
