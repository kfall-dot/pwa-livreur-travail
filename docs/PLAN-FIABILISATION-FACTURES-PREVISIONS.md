# Plan de fiabilisation, de contrôle des factures et de prévision

Date : 25 octobre 2026.

**Statut : plan consigné pour reprise ultérieure.** Ce document n’engage pas la réalisation des lots ni un déploiement. Les décisions métier et le calendrier restent à confirmer avec le client.

## Objectif et ordre de réalisation

Construire dans cet ordre : **des opérations fiables → des factures contrôlables → des prévisions crédibles**.

Trois lots successifs, chacun terminé par une recette avec les utilisateurs. Mettre en attente les nouvelles fonctionnalités secondaires pendant leur réalisation.

| Lot | Objectif | Condition pour passer au suivant |
|---|---|---|
| 1 — Fiabiliser | Terminer les parcours sans perte de données ni incohérence | Parcours essentiels validés par les utilisateurs |
| 2 — Structurer les factures | Identifier les factures et expliquer les écarts avec les commandes et réceptions | Contrôles fiables sur des cas représentatifs du client |
| 3 — Anticiper | Visualiser les échéances et estimer les dépenses futures | Prévisions rapprochées des opérations réellement constatées |

## Lot 1 — Fiabiliser les parcours actuels

### Préparer la recette

- Créer un environnement de recette séparé : application, base de données, stockage des pièces jointes et notifications simulées ou limitées aux destinataires de test.
- Identifier une version de référence et les comptes de chaque rôle : CdC, DT, adjoint SA, chef SA, CdG, DAF, PDG, Comptabilité et Trésorerie.
- Utiliser des données fictives et une procédure de réinitialisation qui ne touche jamais à la production.

### Parcours à couvrir

1. Matériaux à crédit.
2. Matériaux au comptant, avec BT et financement selon le circuit applicable.
3. Main-d’œuvre.
4. Préparation par un adjoint SA et validation du chef aux étapes prévues.
5. Retour pour correction, nouvelle soumission et reprise des validations applicables.
6. Refus définitif, réservé au DAF et au PDG à ce stade.
7. Réception complète, partielle ou refusée, avec photos et justificatifs.
8. Consommation, suppression d’une consommation et recalcul du disponible.
9. Transmission de facture à la Comptabilité et à la Trésorerie, puis paiement par la seule Trésorerie.

Pour chaque parcours, vérifier les montants, documents, statuts, droits et passages de relais. Tester aussi les doubles clics, interruptions réseau et nouvelles tentatives après erreur.

Exemple : 10 sacs commandés, 8 acceptés à la réception, puis 3 consommés → 8 réceptionnés, 3 consommés et 5 disponibles. Les quantités non réceptionnées ne sont pas disponibles.

### Corrections prioritaires

- Une opération ne doit pas être enregistrée deux fois, y compris après nouvelle tentative.
- Un échec conserve la saisie et indique une suite compréhensible.
- Un dossier affiche les mêmes chiffres et statuts dans les différents espaces.
- Les modifications sensibles conservent auteur, date, motif et valeurs avant/après.
- La numérotation EB/BC/BT résiste aux créations simultanées.
- Les contrôles de droits sont vérifiés côté serveur, y compris sur les accès directs aux documents et pièces.

### Méthode et livrables

Chaque fiche de recette précise les comptes et données de départ, les actions, les résultats attendus et constatés, les preuves et les anomalies.

Faire réaliser les tâches par les utilisateurs sans leur indiquer chaque clic. Une hésitation ou une intervention nécessaire constitue aussi un problème d’utilisation à consigner.

Classer les anomalies :

- **Bloquante** : parcours impossible, perte de données, montant faux ou action non autorisée.
- **Majeure** : contournement ou assistance nécessaire.
- **Mineure** : gêne visuelle ou libellé peu clair.

Après correction, rejouer l’étape et la suite du parcours. Livrables : cahier de recette, registre des anomalies et tests de régression sur les incidents corrigés.

**Critère de sortie :** aucun blocage ni anomalie majeure sur les droits, montants, stocks, pièces ou paiements ; réserves restantes explicitement acceptées par le client.

## Lot 2 — Donner une existence propre aux factures

### Confirmer les usages avant de développer

Organiser une séance avec le SA, la Comptabilité et la Trésorerie à partir de leurs documents habituels :

- Une facture peut-elle couvrir plusieurs BC ?
- Un BC peut-il recevoir plusieurs factures ?
- Utilisent-ils des acomptes, avoirs, retenues ou règlements partiels ?
- Quelles différences de prix ou de quantité acceptent-ils ?
- Qui peut autoriser une exception ?

Ces réponses déterminent le modèle. Ne pas conserver implicitement « une facture = un BC ». Les règlements partiels restent conditionnés à la confirmation de leur besoin par le client.

### Fiche facture cible

| Informations | Contenu |
|---|---|
| Identification | Compagnie, fournisseur, référence, date et pièce originale |
| Montants | Montants applicables au client et détail des lignes |
| Rattachement | BC, réceptions, chantier et EB concernés, selon les cardinalités validées |
| Contrôle | Écarts constatés, décision, commentaire et auteur |
| Règlement | Paiements associés et montant restant, selon les usages confirmés |

### Contrôles à introduire progressivement

1. Doublons potentiels : même compagnie, fournisseur et référence, avec règles de normalisation à définir.
2. Prix : différence entre commande et facture.
3. Quantités : commandé, réceptionné accepté et facturé.
4. Pièces et références : éléments manquants avant transmission ou paiement.
5. Exceptions : justification et approbation par le rôle autorisé.

Commencer par des alertes explicites. Activer des blocages uniquement pour les règles validées avec le client. Les avances au comptant et la main-d’œuvre conservent un traitement adapté : ne pas imposer une réception préalable à tous les paiements.

### Reprise et livrables

Conserver les pièces et références des factures existantes, puis signaler les informations à compléter sans les inventer. Prévoir le rapprochement avec les paiements déjà enregistrés et les vérifications de non-duplication.

Livrables : fiche facture, écran de rapprochement, gestion des exceptions et procédure de reprise.

**Critère de sortie :** les utilisateurs peuvent expliquer chaque montant facturé, chaque écart accepté et chaque paiement associé.

## Lot 3 — Construire les échéances, puis les prévisions

### Étape 3A — Échéances certaines

Enregistrer la date d’échéance, les conditions de paiement et les éventuels échéanciers confirmés. Séparer date de facture, échéance, paiement prévu et paiement effectué.

Vue DAF :

- En retard.
- À payer sous 7 jours.
- À payer sous 30 jours.
- Au-delà.
- Échéance non renseignée.

Définir des tranches non chevauchantes dans le calcul. Chaque montant doit être consultable jusqu’à la facture et aux justificatifs. Identifier séparément les dossiers contestés.

### Étape 3B — Prévisions

Ajouter une date de paiement estimée pour les engagements non encore facturés, un responsable et une date de dernière actualisation.

| Niveau | Exemple |
|---|---|
| Certain | Facture validée avec échéance |
| Prévu | Commande engagée avec paiement estimé |
| Estimatif | Achat restant nécessaire, pas encore commandé |

Traiter les recouvrements avant consolidation : une commande devenue facture ne compte pas deux fois. Préserver la distinction entre engagement, réception, facture et paiement.

Pour le coût final d’un chantier, le DT et le CdG renseignent le reste à engager avec une définition commune des coûts déjà comptés. Le DAF et le PDG consultent le coût final estimé, l’écart au budget, les hypothèses et leur fraîcheur.

Ne pas présenter de trésorerie disponible sans soldes fiables ni comparer dépenses et avancement sans données consolidées appropriées.

### Livrables et validation

Livrables : échéancier fournisseurs, prévision des décaissements et estimation du coût final par chantier.

**Critère de sortie :** comparer régulièrement prévu et réalisé, expliquer les écarts et actualiser les hypothèses avec les responsables.

## Organisation et dépendances

- Premier travail à la reprise : cahier de recette et inventaire des données existantes.
- Réunir les utilisateurs sur quelques dossiers représentatifs avant de chiffrer les lots.
- Définir le calendrier et les responsabilités après confirmation des règles de facturation et de paiement ; aucune durée ferme n’est arrêtée dans ce document.
- Confirmer le logiciel comptable du client. Prévoir d’abord un export adapté, des références communes et un suivi des échanges, avant une synchronisation automatique. Ne pas reconstruire sans besoin sa comptabilité générale.
- EFPC est la filiale BTP. Le socle holding est un chantier distinct à réaliser avant l’ouverture à une deuxième filiale ; les données et documents restent rattachés à leur compagnie.

## Repères pour reprendre

- `docs/PILOTAGE-DIRECTION.md` : première vue de prévention DAF/PDG et limites des indicateurs.
- `docs/ARRETES-MENSUELS-GESTION.md` : photographies de gestion versionnées ; distinction avec une clôture comptable.
- `ameliorations-futures.md` : cadrage holding et autres évolutions.

L’existence d’un prototype ou d’un écran ne vaut pas recette métier. À la reprise, vérifier l’état effectivement livré en production et les évolutions restées locales avant d’engager les lots.
