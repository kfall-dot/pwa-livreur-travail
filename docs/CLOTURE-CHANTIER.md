# Clôture d’un chantier — proposition de fonctionnement

Date : 26 octobre 2026.

**Statut : proposition consignée pour discussion avec le client.** Ce document décrit un fonctionnement envisagé ; il ne signifie pas que ces règles sont déjà implémentées. La création de ce document n’engage ni réalisation ni déploiement.

## 1. Objectif

Terminer un chantier sans perdre la visibilité sur ses stocks, engagements, factures, paiements et justificatifs. Distinguer la fin des travaux sur le terrain de la clôture financière : un chantier peut être terminé opérationnellement tout en conservant des fournisseurs ou de la main-d’œuvre à payer.

La clôture de chantier est un processus de gestion propre à l’application. Elle ne remplace pas la clôture comptable dans le logiciel de comptabilité du client ni les arrêtés mensuels de gestion.

## 2. États proposés

| État | Fonctionnement envisagé |
|---|---|
| Actif | Parcours habituels : EB, commandes, livraisons, consommations et paiements. |
| En clôture | Fin de l’activité ordinaire. Plus de nouvelles EB ou de nouvelles affectations de livraison ; traitement des opérations existantes et régularisations expressément autorisées. |
| Clôturé | Consultation, recherche et exports. Modifications opérationnelles ou financières soumises à une réouverture ou à une procédure de régularisation tracée, à définir. |

Le chantier « en clôture » demeure visible dans les files nécessaires au règlement des opérations existantes. Aucun solde ni engagement ne disparaît par le seul changement d’état.

## 3. Parcours proposé

### Préparation sur le terrain

Le CdC prépare le bilan : dernières réceptions, livraisons partielles ou litigieuses, consommations à jour et inventaire des matériaux restants. Les quantités théoriques issues des livraisons confirmées et des consommations sont rapprochées du stock physique ; les écarts sont expliqués et tracés.

Le DT confirme que les travaux sont terminés et demande la mise en clôture. La demande conserve l’auteur, la date, le motif et les observations.

### Mise en clôture

L’application bloque les nouvelles dépenses ordinaires et les nouvelles affectations de livraison. Une commande déjà engagée et sa livraison attendue peuvent encore être réceptionnées. Il faut distinguer cette réception d’une nouvelle planification non autorisée.

Une dépense complémentaire doit être motivée et autorisée par le rôle désigné par le client. Le périmètre des exceptions et leur circuit de validation restent à définir ; la mise en clôture ne doit pas contourner les validations existantes.

### Traitement des dossiers restants

| Intervenant | Vérifications et actions envisagées |
|---|---|
| CdC / DT | Réceptions finales, consommations, livraisons attendues, litiges et stock restant. |
| SA | EB ouvertes, BC non soldés, commandes à annuler, factures et pièces manquantes. |
| Comptabilité | Vérification des factures et rapprochements relevant de ses responsabilités, à préciser avec le client. |
| Trésorerie | Règlements restant à effectuer pour les matériaux et la main-d’œuvre. |
| CdG | Rapprochement du budget, des engagements et des dépenses réalisées ; écarts et dépassements expliqués. |
| DAF | Vérification financière finale et décision de clôture. |

L’application présente une liste des éléments non soldés avec accès aux dossiers. Une commande non livrée n’est pas automatiquement annulée et une EB ouverte n’est pas automatiquement refusée : chaque décision suit une action explicite et tracée.

### Clôture définitive

Proposition : le DAF valide la clôture après confirmation du DT et contrôle du CdG. Une intervention du PDG pourrait être réservée aux exceptions ou aux dépassements importants. Ces pouvoirs sont à confirmer avec le client.

Avant validation, l’application affiche les éléments bloquants et les éventuelles exceptions. Les critères d’absence de dette, de facture manquante, de livraison attendue ou de stock non affecté doivent être décidés explicitement. Aucun contournement silencieux n’est prévu.

## 4. Stock restant

Les reliquats de ciment, de fer ou d’autres matériaux ne doivent pas disparaître à la clôture. Les traitements possibles sont :

- Transfert vers un autre chantier.
- Retour au dépôt.
- Retour au fournisseur.
- Constat d’un écart justifié, validé selon les droits à définir.

Cette gestion nécessite des mouvements de stock tracés : origine, destination, produit, unité, quantité, auteur, dates, justificatifs et confirmation de réception lorsqu’elle s’applique.

Un transfert doit éviter les doubles disponibilités : préciser le traitement des quantités en transit et le moment où le stock devient disponible à destination. La gestion d’un dépôt, des retours et des écarts constitue un besoin supplémentaire à concevoir ; ce document ne présume pas que ces fonctions existent déjà.

## 5. Répercussions dans l’application

| Partie de l’application | En clôture | Clôturé |
|---|---|---|
| Création d’EB | Chantier exclu des choix ordinaires ; exception motivée et autorisée à définir. | Création bloquée sans réouverture autorisée. |
| Ma journée | Régularisation des consommations et informations finales selon les droits définis. | Historique consultable ; saisie bloquée. |
| Suivi chantier | Stock restant, livraisons attendues et inventaire de fin de chantier visibles. | Stock final, écarts et mouvements de sortie consultables. |
| Livraisons | Réceptions des commandes existantes possibles ; nouvelles affectations bloquées sauf exception. | Aucune nouvelle opération sans procédure autorisée. |
| SA | Traitement des EB, BC, annulations et factures existants. | Consultation des dossiers et pièces conservés. |
| Comptabilité / Trésorerie | Contrôles et paiements des dossiers existants possibles. | Consultation ; correction ou paiement tardif selon la procédure retenue. |
| CdG / Direction | Engagements, dépenses et dettes toujours comptés ; liste des points à solder. | Bilan consultable et chantier accessible par filtre. |
| Recherche / tableaux de bord | État clairement identifié ; opérations à traiter toujours visibles. | Retiré des sélections actives par défaut, mais accessible dans l’historique et les exports. |
| Documents | Pièces complétées selon les circuits et droits existants. | EB, BC, BT, BL, factures et justificatifs conservés. |

Les agrégats financiers historiques doivent rester cohérents : filtrer les chantiers actifs pour une vue opérationnelle ne doit pas effacer les dépenses des périodes passées. Les engagements et dettes du chantier restent visibles jusqu’à leur traitement effectif.

## 6. Fiche de clôture

Produire une fiche portant l’identité EFPC et conservant au minimum :

- Identification du chantier, dates de fin opérationnelle et de clôture financière.
- Budget et synthèse des engagements, dépenses et paiements, en distinguant matériaux et main-d’œuvre.
- Liste des opérations annulées ou régularisées et explication des écarts.
- Stock de fin de chantier et destination des reliquats.
- Éventuels dossiers restant ouverts acceptés à titre exceptionnel, si le client autorise ce cas.
- Observations, réserves, auteurs, dates et validations.
- Références des dossiers et accès à leurs justificatifs.

Conserver le bilan tel qu’approuvé pour éviter qu’un document ancien ne change silencieusement lors d’une correction ultérieure. Une réouverture et une nouvelle clôture doivent produire une nouvelle version liée à la précédente.

## 7. Réouverture et corrections ultérieures

Une réouverture doit être réservée aux rôles autorisés, motivée et journalisée. Préciser si elle réactive l’activité opérationnelle ou seulement certains traitements financiers.

Une facture tardive, un retour fournisseur, une correction de consommation ou un écart de stock ne doivent ni supprimer l’historique ni modifier une validation passée sans trace. Définir les opérations permises, leur approbateur et leur répercussion sur les tableaux de bord et la fiche de clôture.

Le changement d’état doit être contrôlé côté serveur pour tous les parcours concernés, y compris les accès directs aux API. Les actions déjà ouvertes dans un autre onglet doivent également respecter le nouvel état du chantier.

## 8. Première version recommandée

Commencer par :

1. Les trois états et leur affichage clair.
2. La demande de mise en clôture et le blocage des nouvelles opérations ordinaires.
3. Une liste des EB, commandes, livraisons, factures, paiements et stocks à traiter.
4. Une validation finale tracée et une fiche de clôture conservée.
5. Une procédure de réouverture contrôlée.

Définir les mouvements de stock avant d’autoriser une clôture qui les exige. Tant que ces mouvements ne sont pas disponibles, un stock restant ne doit pas être considéré comme soldé sans traitement explicite validé.

## 9. Décisions à valider avec le client

- Peut-on déclarer le chantier terminé tout en poursuivant le paiement des dernières factures ? Proposition : oui, dans l’état « en clôture ».
- Qui demande, contrôle, valide et peut rouvrir un chantier ?
- Le DAF peut-il clôturer avec des réserves ou faut-il solder tous les dossiers ?
- Quels événements bloquent la clôture et quelles exceptions peuvent être autorisées ?
- Quel circuit s’applique aux dépenses complémentaires après la fin des travaux ?
- Comment sont gérés les reliquats, dépôts, transferts, retours et écarts de stock ?
- Quel rôle joue le PDG et existe-t-il un seuil d’intervention ?
- Comment traiter les factures et corrections reçues après clôture ?
- Quelle articulation retenir avec le logiciel comptable du client ?

## 10. Cas de recette à prévoir lors de la réalisation

- Chantier terminé avec une facture restant à payer : paiement possible en clôture et dette toujours visible.
- Nouvelle EB refusée sur un chantier en clôture, y compris par accès direct à l’API.
- Réception finale d’une commande existante autorisée avant clôture définitive.
- Stock restant identifié, sans suppression ni double comptage lors de son transfert.
- Clôture empêchée lorsque les conditions métier retenues ne sont pas remplies.
- Historique, documents et dépenses accessibles après clôture.
- Réouverture motivée, droits vérifiés et nouvelle fiche de clôture versionnée.

## Documents associés

- [Plan de fiabilisation, factures et prévisions](PLAN-FIABILISATION-FACTURES-PREVISIONS.md).
- [Arrêtés mensuels de gestion](ARRETES-MENSUELS-GESTION.md).
- [Pilotage de la direction](PILOTAGE-DIRECTION.md).
