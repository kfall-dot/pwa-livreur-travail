# Maquettes HTML — laquelle est à jour ?

> Ces fichiers sont des **maquettes de travail** (design), pas l'application.
> L'application réelle est dans `src/`. Ces maquettes ont servi à valider un
> design avant intégration.
>
> Attention : plusieurs versions coexistent pour un même écran. **Ce tableau
> fait foi.**

## Écrans avec plusieurs versions

| Écran | ✅ Version à jour | Obsolètes | Note |
|---|---|---|---|
| **Page d'accueil** | `landing-wow-v2.html` (aussi copiée dans `index.html`) | `landing-preview.html` | La version « wow » (halos animés, circuit des 5 étapes, compteurs animés, comparateur avant/après). **Les deux fichiers sont identiques.** |
| **Login** | `login-onglets-v2.html` (aussi copiée dans `login.html`) | `login-preview.html`, `login-v6.html` | Fusion livreur + gestionnaire sur **une seule page à onglets** (le réel a deux routes : `/login` et `/manager/login`). |
| **Espace client** | `espace-client-v2.html` (aussi copiée dans `espace-client.html`) | — | 4 513 octets de chaque côté : les deux sont identiques. |

## Écrans à version unique

| Fichier | Écran |
|---|---|
| `achats-list-v2.html` | Liste des achats |
| `catalogue-v1.html` | Catalogue produits |
| `cdg-dashboard.html` | Tableau de bord CdG |
| `cdg-dashboard-v2.html` | *(121 octets — quasi vide, ignorée)* |
| `compta-preview.html` | Aperçu comptabilité |
| `equipe-v1.html` | Équipe |
| `factures-preview.html` | Factures |
| `livraison-flow-v1.html` | Parcours livreur |
| `livraison-manager-v1.html` | Livraisons côté gestionnaire |
| `planifier-v1.html` | Planification |
| `rapports-preview.html` | Rapports |
| `sa-dashboard.html` | Tableau de bord SA |
| `sidebar-manager-v1.html` | Barre latérale |
| `suivi-bc-preview.html` | Suivi BC |
| `suivi-bc-v1.html` | Suivi BC (v1) |
| `taches-manager-v1.html` | Tâches |

## Outil

`gen.py` — générateur de maquettes ( gabarits Python ). Peu utilisé, à jour ?

## Règle

Ne **jamais** ouvrir `*-preview.html` en croyant voir l'écran actuel : ce sont
d'anciennes maquettes conservées pour l'historique. Vérifier la date de
modification (`ls -la`) et ce tableau.

Dernière mise à jour : 25 septembre 2026.
